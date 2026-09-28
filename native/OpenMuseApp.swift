import Cocoa
import WebKit

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate {
    var window: NSWindow!
    var webView: WKWebView!
    var loadingView: NSView!
    var spinner: NSProgressIndicator!
    var statusLabel: NSTextField!
    var serverProcess: Process?
    var pollTimer: Timer?
    let targetURL = URL(string: "http://127.0.0.1:8787")!
    let healthURL = URL(string: "http://127.0.0.1:8787/api/health")!
    let projectDir = "/Users/d/.gemini/antigravity/scratch/openmuse"

    func applicationDidFinishLaunching(_ notification: Notification) {
        setupMenu()
        setupWindow()
        startOpenMuse()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return true
    }

    func applicationWillTerminate(_ notification: Notification) {
        pollTimer?.invalidate()
        if let process = serverProcess, process.isRunning {
            process.terminate()
        }
    }

    private func setupWindow() {
        let screenRect = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        let defaultWidth: CGFloat = min(1280, screenRect.width * 0.9)
        let defaultHeight: CGFloat = min(840, screenRect.height * 0.9)
        let frame = NSRect(
            x: (screenRect.width - defaultWidth) / 2 + screenRect.origin.x,
            y: (screenRect.height - defaultHeight) / 2 + screenRect.origin.y,
            width: defaultWidth,
            height: defaultHeight
        )

        window = NSWindow(
            contentRect: frame,
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.title = "OpenMuse"
        window.minSize = NSSize(width: 900, height: 600)
        window.isReleasedWhenClosed = false
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.backgroundColor = NSColor(calibratedRed: 0.98, green: 0.98, blue: 0.97, alpha: 1.0)

        let container = NSView(frame: window.contentView!.bounds)
        container.autoresizingMask = [.width, .height]
        window.contentView = container

        // Setup WebView
        let config = WKWebViewConfiguration()
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")
        let prefs = WKWebpagePreferences()
        prefs.allowsContentJavaScript = true
        config.defaultWebpagePreferences = prefs
        
        webView = WKWebView(frame: container.bounds, configuration: config)
        webView.autoresizingMask = [.width, .height]
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.customUserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) OpenMuse/1.0"
        webView.setValue(false, forKey: "drawsBackground") // clean native transparent blend
        webView.isHidden = true
        container.addSubview(webView)

        // Setup Loading View
        loadingView = NSView(frame: container.bounds)
        loadingView.autoresizingMask = [.width, .height]

        let stack = NSStackView()
        stack.orientation = .vertical
        stack.alignment = .centerX
        stack.spacing = 16
        stack.translatesAutoresizingMaskIntoConstraints = false
        loadingView.addSubview(stack)

        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: loadingView.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: loadingView.centerYAnchor)
        ])

        // App Icon
        if let iconImage = NSImage(named: NSImage.applicationIconName) ?? NSApp.applicationIconImage {
            let iconView = NSImageView()
            iconView.image = iconImage
            iconView.imageScaling = .scaleProportionallyUpOrDown
            iconView.translatesAutoresizingMaskIntoConstraints = false
            NSLayoutConstraint.activate([
                iconView.widthAnchor.constraint(equalToConstant: 80),
                iconView.heightAnchor.constraint(equalToConstant: 80)
            ])
            stack.addArrangedSubview(iconView)
        }

        let titleLabel = NSTextField(labelWithString: "OpenMuse")
        titleLabel.font = NSFont.systemFont(ofSize: 22, weight: .semibold)
        titleLabel.textColor = NSColor.labelColor
        stack.addArrangedSubview(titleLabel)

        spinner = NSProgressIndicator()
        spinner.style = .spinning
        spinner.controlSize = .regular
        spinner.startAnimation(nil)
        stack.addArrangedSubview(spinner)

        statusLabel = NSTextField(labelWithString: "Connecting to workspace...")
        statusLabel.font = NSFont.systemFont(ofSize: 13, weight: .regular)
        statusLabel.textColor = NSColor.secondaryLabelColor
        stack.addArrangedSubview(statusLabel)

        container.addSubview(loadingView)

        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    private func startOpenMuse() {
        checkHealth { [weak self] isRunning in
            guard let self = self else { return }
            if isRunning {
                self.loadWebApp()
            } else {
                self.launchServerAndPoll()
            }
        }
    }

    private func findNodePath() -> String {
        let candidates = [
            "/Users/d/.local/node-v22/bin/node",
            "/opt/homebrew/bin/node",
            "/usr/local/bin/node",
            "/usr/bin/node"
        ]
        for path in candidates {
            if FileManager.default.isExecutableFile(atPath: path) {
                return path
            }
        }
        return "/Users/d/.local/node-v22/bin/node"
    }

    private func launchServerAndPoll() {
        let nodePath = findNodePath()
        let serverScript = "\(projectDir)/dist/apps/server/src/index.js"

        guard FileManager.default.fileExists(atPath: serverScript) else {
            statusLabel.stringValue = "Server build missing. Run pnpm build:server."
            return
        }

        statusLabel.stringValue = "Starting OpenMuse engine..."
        let process = Process()
        process.executableURL = URL(fileURLWithPath: nodePath)
        process.arguments = [serverScript]
        process.currentDirectoryURL = URL(fileURLWithPath: projectDir)

        var env = ProcessInfo.processInfo.environment
        let extraPaths = "/Users/d/.local/node-v22/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
        if let currentPath = env["PATH"] {
            env["PATH"] = "\(extraPaths):\(currentPath)"
        } else {
            env["PATH"] = extraPaths
        }
        process.environment = env

        let logPath = "\(projectDir)/.openmuse/server.log"
        try? FileManager.default.createDirectory(atPath: "\(projectDir)/.openmuse", withIntermediateDirectories: true)
        if !FileManager.default.fileExists(atPath: logPath) {
            FileManager.default.createFile(atPath: logPath, contents: nil)
        }
        if let logHandle = FileHandle(forWritingAtPath: logPath) {
            logHandle.seekToEndOfFile()
            process.standardOutput = logHandle
            process.standardError = logHandle
        }

        do {
            try process.run()
            self.serverProcess = process
        } catch {
            statusLabel.stringValue = "Failed to start server: \(error.localizedDescription)"
            return
        }

        var attempts = 0
        pollTimer = Timer.scheduledTimer(withTimeInterval: 0.3, repeats: true) { [weak self] timer in
            guard let self = self else { return }
            attempts += 1
            self.checkHealth { [weak self] isRunning in
                guard let self = self else { return }
                if isRunning {
                    timer.invalidate()
                    self.pollTimer = nil
                    self.loadWebApp()
                } else if attempts > 60 {
                    timer.invalidate()
                    self.pollTimer = nil
                    self.statusLabel.stringValue = "Connection timed out. Check .openmuse/server.log"
                }
            }
        }
    }

    private func checkHealth(completion: @escaping (Bool) -> Void) {
        var request = URLRequest(url: healthURL)
        request.timeoutInterval = 1.0
        let task = URLSession.shared.dataTask(with: request) { _, response, error in
            DispatchQueue.main.async {
                if let http = response as? HTTPURLResponse, http.statusCode == 200 {
                    completion(true)
                } else {
                    completion(false)
                }
            }
        }
        task.resume()
    }

    private func loadWebApp() {
        statusLabel.stringValue = "Opening workspace..."
        let request = URLRequest(url: targetURL, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 10.0)
        webView.load(request)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        spinner.stopAnimation(nil)
        loadingView.isHidden = true
        webView.isHidden = false
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        statusLabel.stringValue = "Failed to load: \(error.localizedDescription)"
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if navigationAction.targetFrame == nil, let url = navigationAction.request.url {
            NSWorkspace.shared.open(url)
        }
        return nil
    }

    private func setupMenu() {
        let mainMenu = NSMenu()

        // OpenMuse App Menu
        let appMenuItem = NSMenuItem()
        let appMenu = NSMenu(title: "OpenMuse")
        appMenu.addItem(withTitle: "About OpenMuse", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(withTitle: "Hide OpenMuse", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        let hideOthers = NSMenuItem(title: "Hide Others", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h")
        hideOthers.keyEquivalentModifierMask = [.command, .option]
        appMenu.addItem(hideOthers)
        appMenu.addItem(withTitle: "Show All", action: #selector(NSApplication.unhideAllApplications(_:)), keyEquivalent: "")
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(withTitle: "Quit OpenMuse", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appMenuItem.submenu = appMenu
        mainMenu.addItem(appMenuItem)

        // Edit Menu (Standard copy/paste/select all for webview)
        let editMenuItem = NSMenuItem()
        let editMenu = NSMenu(title: "Edit")
        editMenu.addItem(withTitle: "Undo", action: #selector(UndoManager.undo), keyEquivalent: "z")
        let redoItem = NSMenuItem(title: "Redo", action: #selector(UndoManager.redo), keyEquivalent: "Z")
        redoItem.keyEquivalentModifierMask = [.command, .shift]
        editMenu.addItem(redoItem)
        editMenu.addItem(NSMenuItem.separator())
        editMenu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editMenuItem.submenu = editMenu
        mainMenu.addItem(editMenuItem)

        // View Menu
        let viewMenuItem = NSMenuItem()
        let viewMenu = NSMenu(title: "View")
        let reloadItem = NSMenuItem(title: "Reload", action: #selector(reloadPage), keyEquivalent: "r")
        viewMenu.addItem(reloadItem)
        let fullScreenItem = NSMenuItem(title: "Toggle Full Screen", action: #selector(toggleFullScreen), keyEquivalent: "f")
        fullScreenItem.keyEquivalentModifierMask = [.command, .control]
        viewMenu.addItem(fullScreenItem)
        viewMenuItem.submenu = viewMenu
        mainMenu.addItem(viewMenuItem)

        // Window Menu
        let windowMenuItem = NSMenuItem()
        let windowMenu = NSMenu(title: "Window")
        windowMenu.addItem(withTitle: "Minimize", action: #selector(NSWindow.miniaturize(_:)), keyEquivalent: "m")
        windowMenu.addItem(withTitle: "Zoom", action: #selector(NSWindow.zoom(_:)), keyEquivalent: "")
        windowMenuItem.submenu = windowMenu
        mainMenu.addItem(windowMenuItem)

        NSApp.mainMenu = mainMenu
    }

    @objc private func reloadPage() {
        webView.reload()
    }

    @objc private func toggleFullScreen() {
        window.toggleFullScreen(nil)
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
