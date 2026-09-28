import { execFile, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  computerIdentity,
  type DockerResult,
  type DockerRunner,
} from "../computer.ts";
import type { Config } from "../config.ts";

export function createLocalComputerRunner(config: Config): DockerRunner {
  const containerState = new Map<string, { running: boolean; created: boolean }>();
  const baseWorkspaceDir = resolve(config.dataDir, "computer-workspace");

  const getOwnerWorkspace = (containerName: string) => {
    return join(baseWorkspaceDir, containerName);
  };

  const getIdentityFromTarget = (target: string) => {
    const clean = target.replace(/^\//, "").replace(/-(?:computer|workspace)$/, "");
    const parts = clean.split("-");
    const deployment = parts[1] ?? "";
    const ownerHash = parts[2] ?? "";
    return {
      container: `${clean}-computer`,
      volume: `${clean}-workspace`,
      labels: {
        "dev.openmuse.managed": "computer-v1",
        "dev.openmuse.deployment": deployment,
        "dev.openmuse.owner": ownerHash,
      },
    };
  };

  const ok = (stdout = ""): DockerResult => ({
    stdout,
    stderr: "",
    exitCode: 0,
    timedOut: false,
    interrupted: false,
    truncated: false,
  });

  return async (args, options) => {
    // 1. Container commands
    if (args[0] === "container") {
      const sub = args[1];
      if (sub === "ls") {
        // filter by name
        const filter = args.find((a) => a.startsWith("name="));
        if (filter) {
          const match = filter.replace(/^name=\^\/?/, "").replace(/\$$/, "");
          const state = containerState.get(match);
          if (state?.running) return ok(`${match}-id\n`);
        }
        return ok("");
      }

      if (sub === "inspect") {
        const target = args[2];
        const state = containerState.get(target) ?? { running: true, created: true };
        const identity = getIdentityFromTarget(target);
        const inspection = [
          {
            Id: `${target}-id`,
            Name: `/${target}`,
            Config: {
              Image: config.computerImage ?? "openmuse-computer:local",
              User: "1000:1000",
              Labels: identity.labels,
              Env: ["PATH=/usr/local/bin:/usr/bin:/bin", "HOME=/workspace", "LANG=C.UTF-8"],
              Entrypoint: ["/usr/bin/sleep"],
              Cmd: ["infinity"],
              WorkingDir: "/workspace",
            },
            HostConfig: {
              ReadonlyRootfs: true,
              Privileged: false,
              CapDrop: ["ALL"],
              CapAdd: null,
              SecurityOpt: ["no-new-privileges"],
              NetworkMode: "none",
              Memory: 536870912,
              MemorySwap: 536870912,
              PidsLimit: 128,
              NanoCpus: 1000000000,
              Binds: null,
              Devices: [],
              DeviceRequests: null,
              PortBindings: {},
              PidMode: "",
              IpcMode: "private",
              Tmpfs: { "/tmp": "rw,nosuid,nodev,noexec,size=67108864,mode=1777" },
              RestartPolicy: { Name: "no" },
            },
            Mounts: [
              {
                Type: "volume",
                Name: identity.volume,
                Destination: "/workspace",
                RW: true,
              },
            ],
            NetworkSettings: { Networks: { none: {} } },
            State: { Running: state.running },
          },
        ];
        return ok(JSON.stringify(inspection));
      }

      if (sub === "create") {
        const nameIdx = args.indexOf("--name");
        const name = nameIdx !== -1 ? args[nameIdx + 1] : "openmuse-computer";
        containerState.set(name, { running: false, created: true });
        const ws = getOwnerWorkspace(name);
        mkdirSync(ws, { recursive: true, mode: 0o700 });
        return ok(`${name}-id\n`);
      }

      if (sub === "start") {
        const name = args[2];
        const state = containerState.get(name) ?? { running: false, created: true };
        state.running = true;
        containerState.set(name, state);
        const ws = getOwnerWorkspace(name);
        mkdirSync(ws, { recursive: true, mode: 0o700 });
        return ok(name);
      }

      if (sub === "stop") {
        const name = args.at(-1) ?? "";
        const state = containerState.get(name) ?? { running: true, created: true };
        state.running = false;
        containerState.set(name, state);
        return ok(name);
      }
    }

    // 2. Volume commands
    if (args[0] === "volume") {
      const sub = args[1];
      if (sub === "ls") {
        const filter = args.find((a) => a.startsWith("name="));
        const name = filter ? filter.replace(/^name=\^/, "").replace(/\$$/, "") : "workspace";
        return ok(name);
      }

      if (sub === "inspect") {
        const name = args[2];
        const identity = getIdentityFromTarget(name);
        return ok(
          JSON.stringify([
            {
              Name: name,
              Labels: identity.labels,
              Driver: "local",
              Options: null,
              Scope: "local",
            },
          ]),
        );
      }

      if (sub === "create") {
        const name = args.at(-1) ?? "workspace";
        const ws = getOwnerWorkspace(name);
        mkdirSync(ws, { recursive: true, mode: 0o700 });
        return ok(name);
      }
    }

    // 3. Exec commands
    if (args[0] === "exec") {
      // Find container name in args
      const containerIdx = args.findIndex(
        (a, i) => i > 0 && !a.startsWith("-") && args[i - 1] !== "--user" && args[i - 1] !== "--workdir",
      );
      const containerName = containerIdx !== -1 ? args[containerIdx] : "openmuse-computer";
      const workspaceDir = getOwnerWorkspace(containerName);
      mkdirSync(workspaceDir, { recursive: true, mode: 0o700 });

      // Check if it's the filesystem tool (files.py)
      if (args.includes("/opt/openmuse/files.py") && options.input) {
        try {
          const req = JSON.parse(options.input) as {
            operation: string;
            path: string;
            text?: string;
            base64?: string;
          };
          const relPath = req.path.replace(/^\/workspace\/?/, "");
          const target = relPath ? resolve(workspaceDir, relPath) : workspaceDir;

          if (req.operation === "list") {
            if (!existsSync(target)) {
              mkdirSync(target, { recursive: true, mode: 0o700 });
            }
            const entries = readdirSync(target).map((name) => {
              const full = join(target, name);
              const st = statSync(full);
              return {
                name,
                path: `/workspace/${relPath ? `${relPath}/${name}` : name}`,
                type: st.isDirectory() ? "directory" : "file",
                size: st.size,
              };
            });
            entries.sort((a, b) => (a.type !== "directory" ? 1 : -1) || a.name.localeCompare(b.name));
            return ok(JSON.stringify({ path: req.path, entries }));
          }

          if (req.operation === "read") {
            const text = existsSync(target) ? readFileSync(target, "utf8") : "";
            return ok(JSON.stringify({ path: req.path, text }));
          }

          if (req.operation === "write") {
            writeFileSync(target, req.text ?? "", "utf8");
            return ok(JSON.stringify({ path: req.path }));
          }

          if (req.operation === "mkdir") {
            mkdirSync(target, { recursive: true, mode: 0o700 });
            return ok(JSON.stringify({ path: req.path }));
          }

          if (req.operation === "read_pdf") {
            const buf = existsSync(target) ? readFileSync(target) : Buffer.from("%PDF-empty");
            return ok(JSON.stringify({ path: req.path, base64: buf.toString("base64") }));
          }

          if (req.operation === "write_pdf") {
            const buf = Buffer.from(req.base64 ?? "", "base64");
            writeFileSync(target, buf);
            return ok(JSON.stringify({ path: req.path }));
          }
        } catch (e) {
          return {
            stdout: "",
            stderr: e instanceof Error ? e.message : "Filesystem operation failed",
            exitCode: 1,
            timedOut: false,
            interrupted: false,
            truncated: false,
          };
        }
      }

      // Otherwise it's a bash command
      const cmdIdx = args.lastIndexOf("-c");
      const command = cmdIdx !== -1 ? args[cmdIdx + 1] : args[args.length - 1];

      return new Promise<DockerResult>((res) => {
        let stdout = "";
        let stderr = "";
        const proc = spawn("/bin/bash", ["-c", command], {
          cwd: workspaceDir,
          env: {
            PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
            HOME: workspaceDir,
            LANG: "C.UTF-8",
          },
        });

        const timer = setTimeout(() => {
          proc.kill("SIGKILL");
          res({
            stdout,
            stderr: "Execution timed out",
            exitCode: 124,
            timedOut: true,
            interrupted: false,
            truncated: false,
          });
        }, options.timeoutMs ?? 30000);

        proc.stdout.on("data", (d: Buffer) => {
          stdout += d.toString("utf8");
        });
        proc.stderr.on("data", (d: Buffer) => {
          stderr += d.toString("utf8");
        });
        proc.on("close", (code) => {
          clearTimeout(timer);
          res({
            stdout,
            stderr,
            exitCode: code ?? 0,
            timedOut: false,
            interrupted: false,
            truncated: false,
          });
        });
        proc.on("error", (err) => {
          clearTimeout(timer);
          res({
            stdout,
            stderr: err.message,
            exitCode: 1,
            timedOut: false,
            interrupted: false,
            truncated: false,
          });
        });
      });
    }

    return ok();
  };
}
