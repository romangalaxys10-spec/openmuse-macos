import { useThreads } from "@copilotkit/react-native/headless";
import {
  CalendarDays,
  FileText,
  Globe2,
  Lightbulb,
  type LucideIcon,
  Mail,
  MessageCircle,
  PanelLeftClose,
  PanelsTopLeft,
  Plus,
  Shapes,
  SquareCheck,
  X,
} from "lucide-react-native";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Section } from "../../../packages/domain/src/index.ts";
import { useMuseThread } from "./threads.tsx";
import { colors, Mascot, s } from "./ui.tsx";
import { useWorkspace } from "./workspace.tsx";

const mainTabs: { id: Section; label: string; icon: LucideIcon }[] = [
  { id: "chat", label: "Chat", icon: MessageCircle },
  { id: "activity", label: "Activity", icon: PanelsTopLeft },
  { id: "ideas", label: "Ideas", icon: Lightbulb },
  { id: "goals", label: "Goals", icon: SquareCheck },
  { id: "apps", label: "Apps", icon: Shapes },
];

const appTabs: { id: Section; label: string; icon: LucideIcon }[] = [
  { id: "mail", label: "Mail", icon: Mail },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "browser", label: "Browser", icon: Globe2 },
  { id: "files", label: "Files", icon: FileText },
];

export function Sidebar({
  onClose,
  isOverlay = false,
}: {
  onClose?: () => void;
  isOverlay?: boolean;
}) {
  const { workspace, section, navigate, notify } = useWorkspace();
  const { enabled, selection, visited, mainId, select, start } = useMuseThread();
  const threads = useThreads({ agentId: "default", enabled, includeArchived: false, limit: 30 });

  const handleTabPress = (target: Section) => {
    navigate(target);
    if (isOverlay && onClose) onClose();
  };

  const handleNewChat = () => {
    start();
    navigate("chat");
    notify("Started new chat session");
    if (isOverlay && onClose) onClose();
  };

  const handleSelectThread = (threadId: string, isExisting = true) => {
    select({ id: threadId, existing: isExisting });
    navigate("chat");
    if (isOverlay && onClose) onClose();
  };

  const activeThreads = threads.threads.filter((t) => t.id !== mainId && !t.archived);
  const unlistedVisited = visited.filter(
    (item) => item.id !== mainId && !activeThreads.some((saved) => saved.id === item.id),
  );

  return (
    <View style={[styles.container, isOverlay && styles.overlayContainer]}>
      {/* Top Header */}
      <View style={styles.header}>
        <View style={[s.row, { gap: 10, flex: 1 }]}>
          <Mascot size={32} />
          <View>
            <Text style={styles.brandTitle}>OpenMuse</Text>
            <Text style={styles.brandSubtitle}>
              {workspace.mode === "sample" ? "Local Workspace" : "Live Workspace"}
            </Text>
          </View>
        </View>
        {onClose && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close sidebar"
            onPress={onClose}
            style={styles.closeButton}
          >
            {isOverlay ? (
              <X size={20} color={colors.muted} />
            ) : (
              <PanelLeftClose size={20} color={colors.muted} />
            )}
          </Pressable>
        )}
      </View>

      {/* New Chat Button */}
      <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Start new chat"
          onPress={handleNewChat}
          style={({ pressed }) => [styles.newChatBtn, { opacity: pressed ? 0.8 : 1 }]}
        >
          <Plus size={18} color="#FFF" />
          <Text style={styles.newChatBtnText}>New Chat</Text>
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 24, gap: 18 }}
      >
        {/* Navigation Tabs */}
        <View style={styles.sectionGroup}>
          <Text style={styles.sectionLabel}>Navigation</Text>
          {mainTabs.map((tab) => {
            const isActive = section === tab.id;
            const Icon = tab.icon;
            return (
              <Pressable
                key={tab.id}
                onPress={() => handleTabPress(tab.id)}
                style={[styles.navItem, isActive && styles.navItemActive]}
              >
                <Icon size={18} color={isActive ? colors.blueDark : colors.text} />
                <Text style={[styles.navItemText, isActive && styles.navItemTextActive]}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Earlier Chats & Sessions */}
        <View style={styles.sectionGroup}>
          <View style={[s.between, { paddingHorizontal: 6, marginBottom: 4 }]}>
            <Text style={styles.sectionLabel}>Chats & Sessions</Text>
            {threads.isLoading && <ActivityIndicator size="small" color={colors.blueDark} />}
          </View>

          {/* Main Chat Item */}
          <Pressable
            onPress={() => handleSelectThread(mainId, true)}
            style={[
              styles.chatItem,
              section === "chat" && selection.id === mainId && styles.chatItemActive,
            ]}
          >
            <MessageCircle
              size={17}
              color={section === "chat" && selection.id === mainId ? colors.blueDark : colors.text}
            />
            <View style={{ flex: 1 }}>
              <Text
                numberOfLines={1}
                style={[
                  styles.chatItemText,
                  section === "chat" && selection.id === mainId && styles.chatItemTextActive,
                ]}
              >
                Main Chat
              </Text>
              <Text numberOfLines={1} style={styles.chatItemMuted}>
                Primary conversation
              </Text>
            </View>
          </Pressable>

          {/* Active side chats / sessions */}
          {activeThreads.map((thread) => {
            const isActive = section === "chat" && selection.id === thread.id;
            return (
              <Pressable
                key={thread.id}
                onPress={() => handleSelectThread(thread.id, true)}
                style={[styles.chatItem, isActive && styles.chatItemActive]}
              >
                <MessageCircle size={16} color={isActive ? colors.blueDark : colors.muted} />
                <Text
                  numberOfLines={1}
                  style={[styles.chatItemText, isActive && styles.chatItemTextActive, { flex: 1 }]}
                >
                  {thread.name || "Untitled session"}
                </Text>
              </Pressable>
            );
          })}

          {/* Unlisted visited local sessions */}
          {unlistedVisited.map((item, idx) => {
            const isActive = section === "chat" && selection.id === item.id;
            return (
              <Pressable
                key={item.id}
                onPress={() => handleSelectThread(item.id, item.existing)}
                style={[styles.chatItem, isActive && styles.chatItemActive]}
              >
                <MessageCircle size={16} color={isActive ? colors.blueDark : colors.muted} />
                <Text
                  numberOfLines={1}
                  style={[styles.chatItemText, isActive && styles.chatItemTextActive, { flex: 1 }]}
                >
                  {`Session ${idx + 1}`}
                </Text>
              </Pressable>
            );
          })}

          {!activeThreads.length && !unlistedVisited.length && !threads.isLoading && (
            <Text style={[s.small, { paddingHorizontal: 8, fontStyle: "italic" }]}>
              No side sessions yet. Click New Chat above to start one!
            </Text>
          )}
        </View>

        {/* Connected Apps */}
        <View style={styles.sectionGroup}>
          <Text style={styles.sectionLabel}>Connected Apps</Text>
          {appTabs.map((tab) => {
            const isActive = section === tab.id;
            const Icon = tab.icon;
            return (
              <Pressable
                key={tab.id}
                onPress={() => handleTabPress(tab.id)}
                style={[styles.navItem, isActive && styles.navItemActive]}
              >
                <Icon size={17} color={isActive ? colors.blueDark : colors.muted} />
                <Text style={[styles.navItemText, isActive && styles.navItemTextActive]}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 270,
    backgroundColor: "#F8F9FA",
    borderRightWidth: 1,
    borderRightColor: "#EAEAEA",
    height: "100%",
  },
  overlayContainer: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    zIndex: 100,
    shadowColor: "#000",
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#EAEAEA",
  },
  brandTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
    letterSpacing: -0.3,
  },
  brandSubtitle: {
    fontSize: 11,
    color: colors.muted,
  },
  closeButton: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: "#EEEEF0",
  },
  newChatBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: colors.text,
  },
  newChatBtnText: {
    color: "#FFF",
    fontWeight: "600",
    fontSize: 14,
  },
  sectionGroup: {
    gap: 3,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
    paddingHorizontal: 6,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  navItemActive: {
    backgroundColor: colors.blue,
  },
  navItemText: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.text,
  },
  navItemTextActive: {
    color: colors.blueDark,
    fontWeight: "600",
  },
  chatItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  chatItemActive: {
    backgroundColor: "#E7F1FB",
  },
  chatItemText: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.text,
  },
  chatItemTextActive: {
    color: colors.blueDark,
    fontWeight: "600",
  },
  chatItemMuted: {
    fontSize: 10,
    color: colors.muted,
  },
});
