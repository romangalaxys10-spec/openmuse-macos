import { useThreads } from "@copilotkit/react-native/headless";
import {
  Archive,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock,
  FileText,
  FolderGit2,
  FolderKanban,
  Globe2,
  Lightbulb,
  type LucideIcon,
  Mail,
  MessageCircle,
  MoreVertical,
  PanelLeftClose,
  PanelsTopLeft,
  Plus,
  Shapes,
  SquareCheck,
  Search,
  Tag,
  Trash2,
  X,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type {
  Project,
  ProjectTask,
  Section,
  SessionMeta,
} from "../../../packages/domain/src/index.ts";
import { PROJECT_COLORS } from "./projects-screen.tsx";
import { useMuseThread } from "./threads.tsx";
import { Button, colors, Field, Mascot, s, Sheet } from "./ui.tsx";
import { useWorkspace } from "./workspace.tsx";

const mainTabs: { id: Section; label: string; icon: LucideIcon }[] = [
  { id: "chat", label: "Chat", icon: MessageCircle },
  { id: "projects", label: "Projects", icon: FolderKanban },
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

const PRESET_TAGS = [
  { name: "research", bg: "#EBF5FF", text: "#1E40AF" },
  { name: "bug", bg: "#FEE2E2", text: "#991B1B" },
  { name: "feature", bg: "#ECFDF5", text: "#065F46" },
  { name: "urgent", bg: "#FEF3C7", text: "#92400E" },
  { name: "notes", bg: "#F3E8FF", text: "#6B21A8" },
];

export function Sidebar({
  onClose,
  isOverlay = false,
}: {
  onClose?: () => void;
  isOverlay?: boolean;
}) {
  const { workspace, section, navigate, notify, api } = useWorkspace();
  const { enabled, selection, visited, mainId, select, start } = useMuseThread();
  const threads = useThreads({ agentId: "default", enabled, includeArchived: false, limit: 30 });

  // Projects & Tasks state
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});
  const [threadsMeta, setThreadsMeta] = useState<Record<string, SessionMeta>>({});

  // Active Menu Thread state
  const [menuThread, setMenuThread] = useState<{ id: string; name: string } | null>(null);
  const [editingName, setEditingName] = useState("");
  const [customTagInput, setCustomTagInput] = useState("");
  const [savingAction, setSavingAction] = useState(false);

  // Search & Tag Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTagFilter, setSelectedTagFilter] = useState<string | null>(null);

  // Quick New Project / Task modal state
  const [quickNewProjectOpen, setQuickNewProjectOpen] = useState(false);
  const [quickProjectName, setQuickProjectName] = useState("");
  const [quickProjectColor, setQuickProjectColor] = useState("blue");
  const [quickTaskProjectId, setQuickTaskProjectId] = useState<string | null>(null);
  const [quickTaskTitle, setQuickTaskTitle] = useState("");

  const loadProjectsAndMeta = useCallback(async () => {
    try {
      const [projs, tsks, metaList] = await Promise.all([
        api.request<Project[]>("/api/projects").catch(() => []),
        api.request<ProjectTask[]>("/api/project-tasks").catch(() => []),
        api.request<SessionMeta[]>("/api/threads/meta").catch(() => []),
      ]);
      setProjects(projs);
      setTasks(tsks);
      const metaMap: Record<string, SessionMeta> = {};
      for (const m of metaList) {
        metaMap[m.id] = m;
      }
      setThreadsMeta(metaMap);
    } catch {
      // Non-blocking
    }
  }, [api]);

  useEffect(() => {
    void loadProjectsAndMeta();
  }, [loadProjectsAndMeta]);

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

  const toggleProjectExpand = (projId: string) => {
    setExpandedProjects((prev) => ({
      ...prev,
      [projId]: !prev[projId],
    }));
  };

  const handleQuickCreateProject = async () => {
    if (!quickProjectName.trim()) return;
    try {
      const created = await api.request<Project>(
        "/api/projects",
        {
          name: quickProjectName.trim(),
          color: quickProjectColor,
          status: "active",
        },
        "POST",
      );
      setProjects((prev) => [...prev, created]);
      setExpandedProjects((prev) => ({ ...prev, [created.id]: true }));
      setQuickNewProjectOpen(false);
      setQuickProjectName("");
      notify(`Project "${created.name}" created`);
    } catch (err: any) {
      notify(err?.message || "Failed to create project");
    }
  };

  const handleQuickCreateTask = async (projectId: string) => {
    if (!quickTaskTitle.trim()) return;
    try {
      const created = await api.request<ProjectTask>(
        "/api/project-tasks",
        {
          title: quickTaskTitle.trim(),
          projectId,
          status: "todo",
          priority: "medium",
        },
        "POST",
      );
      setTasks((prev) => [...prev, created]);
      setQuickTaskProjectId(null);
      setQuickTaskTitle("");
      notify(`Task "${created.title}" added`);
    } catch (err: any) {
      notify(err?.message || "Failed to add task");
    }
  };

  const handleToggleTask = async (task: ProjectTask) => {
    const nextStatus: ProjectTask["status"] =
      task.status === "done" ? "todo" : "done";
    try {
      const updated = await api.request<ProjectTask>(
        `/api/project-tasks/${task.id}`,
        { status: nextStatus },
        "PATCH",
      );
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
    } catch (err: any) {
      notify(err?.message || "Failed to update task");
    }
  };

  // Mini menu operations
  const openMenuForThread = (id: string, name: string) => {
    const existingMeta = threadsMeta[id];
    setMenuThread({ id, name: existingMeta?.name || name });
    setEditingName(existingMeta?.name || name);
    setCustomTagInput("");
  };

  const handleSaveRename = async () => {
    if (!menuThread || !editingName.trim()) return;
    setSavingAction(true);
    try {
      await api.request(
        `/api/threads/${menuThread.id}/meta`,
        { name: editingName.trim() },
        "PATCH",
      );
      setThreadsMeta((prev) => ({
        ...prev,
        [menuThread.id]: {
          ...prev[menuThread.id],
          id: menuThread.id,
          name: editingName.trim(),
        },
      }));
      setMenuThread(null);
      notify("Session renamed");
    } catch (err: any) {
      notify(err?.message || "Failed to rename session");
    } finally {
      setSavingAction(false);
    }
  };

  const handleArchiveThread = async () => {
    if (!menuThread) return;
    setSavingAction(true);
    try {
      await api.request(`/api/threads/${menuThread.id}/archive`, {}, "POST");
      setThreadsMeta((prev) => ({
        ...prev,
        [menuThread.id]: {
          ...prev[menuThread.id],
          id: menuThread.id,
          archived: true,
        },
      }));
      setMenuThread(null);
      notify("Session archived");
    } catch (err: any) {
      notify(err?.message || "Failed to archive session");
    } finally {
      setSavingAction(false);
    }
  };

  const handleDeleteThread = async () => {
    if (!menuThread) return;
    setSavingAction(true);
    try {
      await api.request(`/api/threads/${menuThread.id}`, {}, "DELETE");
      setThreadsMeta((prev) => {
        const next = { ...prev };
        delete next[menuThread.id];
        return next;
      });
      if (selection.id === menuThread.id) {
        select({ id: mainId, existing: true });
      }
      setMenuThread(null);
      notify("Session deleted");
    } catch (err: any) {
      notify(err?.message || "Failed to delete session");
    } finally {
      setSavingAction(false);
    }
  };

  const handleToggleTag = async (tagName: string) => {
    if (!menuThread) return;
    const currentTags = threadsMeta[menuThread.id]?.tags || [];
    const hasTag = currentTags.includes(tagName);
    const nextTags = hasTag
      ? currentTags.filter((t) => t !== tagName)
      : [...currentTags, tagName];

    try {
      await api.request(
        `/api/threads/${menuThread.id}/meta`,
        { tags: nextTags },
        "PATCH",
      );
      setThreadsMeta((prev) => ({
        ...prev,
        [menuThread.id]: {
          ...prev[menuThread.id],
          id: menuThread.id,
          tags: nextTags,
        },
      }));
    } catch (err: any) {
      notify(err?.message || "Failed to update tags");
    }
  };

  const handleAddCustomTag = async () => {
    const clean = customTagInput.trim().toLowerCase();
    if (!clean || !menuThread) return;
    await handleToggleTag(clean);
    setCustomTagInput("");
  };

  const handleAssignProject = async (projectId?: string) => {
    if (!menuThread) return;
    try {
      await api.request(
        `/api/threads/${menuThread.id}/meta`,
        { projectId: projectId || null },
        "PATCH",
      );
      setThreadsMeta((prev) => ({
        ...prev,
        [menuThread.id]: {
          ...prev[menuThread.id],
          id: menuThread.id,
          projectId: projectId || undefined,
        },
      }));
      notify(projectId ? "Moved to project" : "Removed from project");
    } catch (err: any) {
      notify(err?.message || "Failed to move to project");
    }
  };

  const allUniqueTags = useMemo(() => {
    const set = new Set<string>();
    for (const p of PRESET_TAGS) set.add(p.name);
    for (const m of Object.values(threadsMeta)) {
      if (m.tags) {
        for (const t of m.tags) set.add(t);
      }
    }
    return Array.from(set);
  }, [threadsMeta]);

  const tagCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of Object.values(threadsMeta)) {
      if (!m.archived && m.tags) {
        for (const t of m.tags) {
          counts[t] = (counts[t] || 0) + 1;
        }
      }
    }
    return counts;
  }, [threadsMeta]);

  const matchesFilter = useCallback(
    (threadId: string, displayName: string) => {
      const meta = threadsMeta[threadId];
      const tags = meta?.tags || [];
      const linkedProject = projects.find((p) => p.id === meta?.projectId);

      if (selectedTagFilter) {
        if (!tags.includes(selectedTagFilter)) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const cleanQ = q.startsWith("#") ? q.slice(1) : q;
        const nameMatch = displayName.toLowerCase().includes(q);
        const tagMatch = tags.some((t) => t.toLowerCase().includes(cleanQ));
        const projectMatch = linkedProject?.name.toLowerCase().includes(q);
        if (!nameMatch && !tagMatch && !projectMatch) return false;
      }

      return true;
    },
    [threadsMeta, projects, selectedTagFilter, searchQuery],
  );

  const activeThreads = threads.threads.filter((t) => {
    if (t.id === mainId) return false;
    const meta = threadsMeta[t.id];
    return !(t.archived || meta?.archived);
  });

  const unlistedVisited = visited.filter((item) => {
    if (item.id === mainId) return false;
    const meta = threadsMeta[item.id];
    return !meta?.archived && !activeThreads.some((saved) => saved.id === item.id);
  });

  const filteredActiveThreads = activeThreads.filter((t) => {
    const meta = threadsMeta[t.id];
    const name = meta?.name || t.name || "Untitled session";
    return matchesFilter(t.id, name);
  });

  const filteredUnlistedVisited = unlistedVisited.filter((item, idx) => {
    const meta = threadsMeta[item.id];
    const name = meta?.name || `Session ${idx + 1}`;
    return matchesFilter(item.id, name);
  });

  const showMainChat =
    !selectedTagFilter &&
    (!searchQuery.trim() || "main chat".includes(searchQuery.trim().toLowerCase()));

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
          <View style={[s.between, { paddingHorizontal: 6, marginBottom: 6 }]}>
            <Text style={styles.sectionLabel}>Chats & Sessions</Text>
            {threads.isLoading && <ActivityIndicator size="small" color={colors.blueDark} />}
          </View>

          {/* Search and Tag Filter Bar */}
          <View style={{ gap: 6, paddingHorizontal: 4, marginBottom: 8 }}>
            {/* Search Input */}
            <View style={styles.searchBarContainer}>
              <Search size={14} color={colors.muted} />
              <TextInput
                placeholder="Search chats or #tag..."
                placeholderTextColor={colors.muted}
                value={searchQuery}
                onChangeText={setSearchQuery}
                style={styles.searchInput}
              />
              {(!!searchQuery || !!selectedTagFilter) && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Clear filter"
                  onPress={() => {
                    setSearchQuery("");
                    setSelectedTagFilter(null);
                  }}
                  style={styles.clearSearchBtn}
                >
                  <X size={13} color={colors.muted} />
                </Pressable>
              )}
            </View>

            {/* Tag Filter Pills */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 5, paddingVertical: 2 }}
            >
              <Pressable
                onPress={() => setSelectedTagFilter(null)}
                style={[
                  styles.tagFilterChip,
                  !selectedTagFilter && styles.tagFilterChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.tagFilterChipText,
                    !selectedTagFilter && styles.tagFilterChipTextActive,
                  ]}
                >
                  All
                </Text>
              </Pressable>

              {allUniqueTags.map((tagName) => {
                const isSelected = selectedTagFilter === tagName;
                const count = tagCounts[tagName] || 0;
                const preset = PRESET_TAGS.find((p) => p.name === tagName);
                const tagBg = isSelected ? colors.text : preset?.bg || "#F1F2F3";
                const tagTextColor = isSelected ? "#FFFFFF" : preset?.text || colors.text;

                return (
                  <Pressable
                    key={tagName}
                    onPress={() =>
                      setSelectedTagFilter((prev) => (prev === tagName ? null : tagName))
                    }
                    style={[
                      styles.tagFilterChip,
                      { backgroundColor: tagBg },
                      isSelected && { borderColor: colors.text },
                    ]}
                  >
                    <Text style={[styles.tagFilterChipText, { color: tagTextColor }]}>
                      #{tagName}
                    </Text>
                    {count > 0 && (
                      <View
                        style={[
                          styles.tagFilterBadge,
                          isSelected && { backgroundColor: "rgba(255,255,255,0.3)" },
                        ]}
                      >
                        <Text
                          style={[
                            styles.tagFilterBadgeText,
                            isSelected && { color: "#FFFFFF" },
                          ]}
                        >
                          {count}
                        </Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Filter Active Indicator */}
            {(!!searchQuery || !!selectedTagFilter) && (
              <View style={[s.between, styles.filterActiveBar]}>
                <Text style={styles.filterActiveText}>
                  Filtering: {selectedTagFilter ? `#${selectedTagFilter}` : `"${searchQuery}"`} (
                  {filteredActiveThreads.length + filteredUnlistedVisited.length})
                </Text>
                <Pressable
                  onPress={() => {
                    setSearchQuery("");
                    setSelectedTagFilter(null);
                  }}
                >
                  <Text style={styles.clearFilterLink}>Clear</Text>
                </Pressable>
              </View>
            )}
          </View>

          {/* Main Chat Item */}
          {showMainChat && (
            <View
              style={[
                styles.chatItemRow,
                section === "chat" && selection.id === mainId && styles.chatItemActive,
              ]}
            >
              <Pressable
                onPress={() => handleSelectThread(mainId, true)}
                style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10 }}
              >
                <MessageCircle
                  size={17}
                  color={
                    section === "chat" && selection.id === mainId ? colors.blueDark : colors.text
                  }
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
            </View>
          )}

          {/* Active side chats / sessions */}
          {filteredActiveThreads.map((thread) => {
            const isActive = section === "chat" && selection.id === thread.id;
            const meta = threadsMeta[thread.id];
            const displayName = meta?.name || thread.name || "Untitled session";
            const tags = meta?.tags || [];
            const linkedProject = projects.find((p) => p.id === meta?.projectId);
            const pColor = linkedProject
              ? PROJECT_COLORS[linkedProject.color || "blue"] || PROJECT_COLORS.blue
              : null;

            return (
              <View
                key={thread.id}
                style={[styles.chatItemRow, isActive && styles.chatItemActive]}
              >
                <Pressable
                  onPress={() => handleSelectThread(thread.id, true)}
                  style={{ flex: 1, flexDirection: "row", alignItems: "flex-start", gap: 9 }}
                >
                  <MessageCircle
                    size={16}
                    color={isActive ? colors.blueDark : colors.muted}
                    style={{ marginTop: 2 }}
                  />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text
                      numberOfLines={1}
                      style={[styles.chatItemText, isActive && styles.chatItemTextActive]}
                    >
                      {displayName}
                    </Text>

                    {/* Tags and project preview pills */}
                    {(tags.length > 0 || linkedProject) && (
                      <View style={[s.row, { gap: 4, flexWrap: "wrap" }]}>
                        {linkedProject && pColor && (
                          <View
                            style={[
                              styles.miniPill,
                              { backgroundColor: pColor.bg, borderColor: pColor.dot, borderWidth: 0.5 },
                            ]}
                          >
                            <View
                              style={[
                                styles.colorDotSmall,
                                { backgroundColor: pColor.dot },
                              ]}
                            />
                            <Text style={[styles.miniPillText, { color: pColor.text }]}>
                              {linkedProject.name}
                            </Text>
                          </View>
                        )}
                        {tags.slice(0, 3).map((tagStr) => (
                          <View key={tagStr} style={styles.miniPill}>
                            <Text style={styles.miniPillText}>#{tagStr}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                </Pressable>

                {/* 3-dots Context Menu Button */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Session menu"
                  onPress={() => openMenuForThread(thread.id, displayName)}
                  style={styles.moreBtn}
                >
                  <MoreVertical size={15} color={colors.muted} />
                </Pressable>
              </View>
            );
          })}

          {/* Unlisted visited local sessions */}
          {filteredUnlistedVisited.map((item, idx) => {
            const isActive = section === "chat" && selection.id === item.id;
            const meta = threadsMeta[item.id];
            const displayName = meta?.name || `Session ${idx + 1}`;
            const tags = meta?.tags || [];

            return (
              <View
                key={item.id}
                style={[styles.chatItemRow, isActive && styles.chatItemActive]}
              >
                <Pressable
                  onPress={() => handleSelectThread(item.id, item.existing)}
                  style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 9 }}
                >
                  <MessageCircle size={16} color={isActive ? colors.blueDark : colors.muted} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text
                      numberOfLines={1}
                      style={[styles.chatItemText, isActive && styles.chatItemTextActive]}
                    >
                      {displayName}
                    </Text>
                    {tags.length > 0 && (
                      <View style={[s.row, { gap: 4 }]}>
                        {tags.map((t) => (
                          <View key={t} style={styles.miniPill}>
                            <Text style={styles.miniPillText}>#{t}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Session menu"
                  onPress={() => openMenuForThread(item.id, displayName)}
                  style={styles.moreBtn}
                >
                  <MoreVertical size={15} color={colors.muted} />
                </Pressable>
              </View>
            );
          })}

          {/* Empty search / tag filter state */}
          {(!!searchQuery || !!selectedTagFilter) &&
            !filteredActiveThreads.length &&
            !filteredUnlistedVisited.length && (
              <View style={styles.noFilterResults}>
                <Text style={styles.noFilterResultsText}>
                  No chats match {selectedTagFilter ? `#${selectedTagFilter}` : `"${searchQuery}"`}
                </Text>
                <Pressable
                  onPress={() => {
                    setSearchQuery("");
                    setSelectedTagFilter(null);
                  }}
                  style={{ marginTop: 4 }}
                >
                  <Text style={styles.clearFilterLink}>Reset Filter</Text>
                </Pressable>
              </View>
            )}

          {!activeThreads.length && !unlistedVisited.length && !threads.isLoading && (
            <Text style={[s.small, { paddingHorizontal: 8, fontStyle: "italic" }]}>
              No side sessions yet. Click New Chat above to start one!
            </Text>
          )}
        </View>

        {/* Projects & Tasks Section */}
        <View style={styles.sectionGroup}>
          <View style={[s.between, { paddingHorizontal: 6, marginBottom: 4 }]}>
            <View style={[s.row, { gap: 6 }]}>
              <FolderGit2 size={13} color={colors.muted} />
              <Text style={styles.sectionLabel}>Projects & Tasks</Text>
            </View>
            <Pressable
              onPress={() => setQuickNewProjectOpen(true)}
              style={styles.smallAddBtn}
            >
              <Plus size={14} color={colors.blueDark} />
            </Pressable>
          </View>

          {projects.length === 0 ? (
            <Pressable
              onPress={() => setQuickNewProjectOpen(true)}
              style={styles.emptyProjectsCard}
            >
              <Text style={styles.emptyProjectsText}>+ Create your first project</Text>
            </Pressable>
          ) : (
            projects.map((proj) => {
              const isExpanded = !!expandedProjects[proj.id];
              const pColor = PROJECT_COLORS[proj.color || "blue"] || PROJECT_COLORS.blue;
              const projTasks = tasks.filter((t) => t.projectId === proj.id);

              return (
                <View key={proj.id} style={styles.projectAccordion}>
                  {/* Project Header Row */}
                  <View style={styles.projectHeaderRow}>
                    <Pressable
                      onPress={() => toggleProjectExpand(proj.id)}
                      style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 7 }}
                    >
                      {isExpanded ? (
                        <ChevronDown size={14} color={colors.muted} />
                      ) : (
                        <ChevronRight size={14} color={colors.muted} />
                      )}
                      <View style={[styles.colorDot, { backgroundColor: pColor.dot }]} />
                      <Text numberOfLines={1} style={styles.projectTitle}>
                        {proj.name}
                      </Text>
                      <View style={styles.taskCountBadge}>
                        <Text style={styles.taskCountBadgeText}>{projTasks.length}</Text>
                      </View>
                    </Pressable>

                    <Pressable
                      onPress={() => {
                        setQuickTaskProjectId(proj.id);
                        setQuickTaskTitle("");
                      }}
                      style={styles.smallAddBtn}
                    >
                      <Plus size={13} color={colors.muted} />
                    </Pressable>
                  </View>

                  {/* Tasks under this project */}
                  {isExpanded && (
                    <View style={styles.projectTasksList}>
                      {/* Inline quick add task input if triggered */}
                      {quickTaskProjectId === proj.id && (
                        <View style={styles.inlineAddTask}>
                          <TextInput
                            placeholder="Task title..."
                            placeholderTextColor={colors.muted}
                            value={quickTaskTitle}
                            onChangeText={setQuickTaskTitle}
                            autoFocus
                            onSubmitEditing={() => void handleQuickCreateTask(proj.id)}
                            style={styles.inlineInput}
                          />
                          <Pressable
                            onPress={() => void handleQuickCreateTask(proj.id)}
                            style={styles.inlineSaveBtn}
                          >
                            <Check size={14} color="#FFF" />
                          </Pressable>
                          <Pressable
                            onPress={() => setQuickTaskProjectId(null)}
                            style={styles.inlineCancelBtn}
                          >
                            <X size={14} color={colors.muted} />
                          </Pressable>
                        </View>
                      )}

                      {projTasks.map((t) => (
                        <View key={t.id} style={styles.taskRow}>
                          <Pressable
                            onPress={() => void handleToggleTask(t)}
                            style={{ padding: 2 }}
                          >
                            {t.status === "done" ? (
                              <CheckCircle2 size={15} color="#10B981" />
                            ) : (
                              <Circle size={15} color={colors.muted} />
                            )}
                          </Pressable>
                          <Pressable
                            onPress={() => {
                              if (t.threadId) {
                                handleSelectThread(t.threadId, true);
                              } else {
                                navigate("projects");
                                if (isOverlay && onClose) onClose();
                              }
                            }}
                            style={{ flex: 1 }}
                          >
                            <Text
                              numberOfLines={1}
                              style={[
                                styles.taskRowTitle,
                                t.status === "done" && styles.taskRowTitleDone,
                              ]}
                            >
                              {t.title}
                            </Text>
                          </Pressable>
                        </View>
                      ))}

                      {projTasks.length === 0 && quickTaskProjectId !== proj.id && (
                        <Pressable
                          onPress={() => setQuickTaskProjectId(proj.id)}
                          style={{ paddingVertical: 4, paddingLeft: 22 }}
                        >
                          <Text style={[s.small, { fontStyle: "italic" }]}>
                            + Add a task
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  )}
                </View>
              );
            })
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

      {/* Session Context Mini Menu Modal */}
      {menuThread && (
        <Sheet
          title="Session Actions"
          subtitle={menuThread.name}
          onClose={() => setMenuThread(null)}
        >
          <View style={{ gap: 18 }}>
            {/* Rename */}
            <View style={{ gap: 6 }}>
              <Text style={[s.small, { fontWeight: "700", color: colors.text }]}>
                Rename Session
              </Text>
              <View style={[s.row, { gap: 8 }]}>
                <TextInput
                  value={editingName}
                  onChangeText={setEditingName}
                  placeholder="Session name"
                  placeholderTextColor={colors.muted}
                  style={[s.input, { flex: 1, minHeight: 40 }]}
                />
                <Button small primary busy={savingAction} onPress={handleSaveRename}>
                  Save
                </Button>
              </View>
            </View>

            {/* Tags Management */}
            <View style={{ gap: 8 }}>
              <View style={[s.row, { gap: 6 }]}>
                <Tag size={14} color={colors.text} />
                <Text style={[s.small, { fontWeight: "700", color: colors.text }]}>
                  Tags
                </Text>
              </View>

              <View style={[s.row, { gap: 8, flexWrap: "wrap" }]}>
                {PRESET_TAGS.map((tag) => {
                  const currentTags = threadsMeta[menuThread.id]?.tags || [];
                  const active = currentTags.includes(tag.name);
                  return (
                    <Pressable
                      key={tag.name}
                      onPress={() => void handleToggleTag(tag.name)}
                      style={[
                        styles.tagBadge,
                        { backgroundColor: tag.bg },
                        active && { borderWidth: 1.5, borderColor: tag.text },
                      ]}
                    >
                      <Text style={[styles.tagBadgeText, { color: tag.text }]}>
                        {active ? "✓ " : ""}#{tag.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Add custom tag */}
              <View style={[s.row, { gap: 8, marginTop: 4 }]}>
                <TextInput
                  value={customTagInput}
                  onChangeText={setCustomTagInput}
                  placeholder="Custom tag..."
                  placeholderTextColor={colors.muted}
                  onSubmitEditing={handleAddCustomTag}
                  style={[s.input, { flex: 1, minHeight: 38, fontSize: 13 }]}
                />
                <Button small onPress={handleAddCustomTag}>
                  + Add Tag
                </Button>
              </View>
            </View>

            {/* Move to Project */}
            {projects.length > 0 && (
              <View style={{ gap: 8 }}>
                <View style={[s.row, { gap: 6 }]}>
                  <FolderGit2 size={14} color={colors.text} />
                  <Text style={[s.small, { fontWeight: "700", color: colors.text }]}>
                    Assign to Project
                  </Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  <Pressable
                    onPress={() => void handleAssignProject(undefined)}
                    style={[
                      styles.projectChoice,
                      !threadsMeta[menuThread.id]?.projectId && styles.projectChoiceActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.projectChoiceText,
                        !threadsMeta[menuThread.id]?.projectId && styles.projectChoiceTextActive,
                      ]}
                    >
                      None
                    </Text>
                  </Pressable>

                  {projects.map((proj) => {
                    const sel = threadsMeta[menuThread.id]?.projectId === proj.id;
                    const c = PROJECT_COLORS[proj.color || "blue"] || PROJECT_COLORS.blue;
                    return (
                      <Pressable
                        key={proj.id}
                        onPress={() => void handleAssignProject(proj.id)}
                        style={[
                          styles.projectChoice,
                          sel && { backgroundColor: c.bg, borderColor: c.dot },
                        ]}
                      >
                        <View style={[styles.colorDotSmall, { backgroundColor: c.dot }]} />
                        <Text
                          style={[
                            styles.projectChoiceText,
                            sel && { color: c.text, fontWeight: "700" },
                          ]}
                        >
                          {proj.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* Actions: Archive & Delete */}
            <View style={[s.row, { justifyContent: "space-between", marginTop: 12, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 14 }]}>
              <Button
                small
                icon={Archive}
                busy={savingAction}
                onPress={() => void handleArchiveThread()}
              >
                Archive Session
              </Button>
              <Button
                small
                danger
                icon={Trash2}
                busy={savingAction}
                onPress={() => void handleDeleteThread()}
              >
                Delete Session
              </Button>
            </View>
          </View>
        </Sheet>
      )}

      {/* Quick New Project Sheet */}
      {quickNewProjectOpen && (
        <Sheet
          title="New Project"
          subtitle="Create a project to group tasks and chats."
          onClose={() => setQuickNewProjectOpen(false)}
        >
          <View style={{ gap: 14 }}>
            <Field
              label="Project Name"
              placeholder="e.g. Mobile App Redesign"
              value={quickProjectName}
              onChangeText={setQuickProjectName}
            />
            <View style={{ gap: 6 }}>
              <Text style={[s.small, { fontWeight: "600", color: colors.text }]}>
                Color
              </Text>
              <View style={[s.row, { gap: 10 }]}>
                {Object.keys(PROJECT_COLORS).map((cKey) => {
                  const sel = quickProjectColor === cKey;
                  return (
                    <Pressable
                      key={cKey}
                      onPress={() => setQuickProjectColor(cKey)}
                      style={[
                        styles.colorDot,
                        { width: 24, height: 24, borderRadius: 12, backgroundColor: PROJECT_COLORS[cKey].dot },
                        sel && { borderWidth: 2.5, borderColor: "#111" },
                      ]}
                    />
                  );
                })}
              </View>
            </View>

            <View style={[s.row, { justifyContent: "flex-end", gap: 10, marginTop: 10 }]}>
              <Button small onPress={() => setQuickNewProjectOpen(false)}>
                Cancel
              </Button>
              <Button small primary onPress={() => void handleQuickCreateProject()}>
                Create
              </Button>
            </View>
          </View>
        </Sheet>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 280,
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
    paddingHorizontal: 6,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
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
  chatItemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 7,
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
  moreBtn: {
    padding: 6,
    borderRadius: 6,
  },
  miniPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingVertical: 1.5,
    paddingHorizontal: 6,
    borderRadius: 6,
    backgroundColor: "#E9ECEF",
  },
  miniPillText: {
    fontSize: 9.5,
    fontWeight: "600",
    color: colors.muted,
  },
  colorDotSmall: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  colorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  smallAddBtn: {
    padding: 4,
    borderRadius: 6,
    backgroundColor: "#EEEEF0",
  },
  emptyProjectsCard: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderStyle: "dashed",
    alignItems: "center",
    marginHorizontal: 4,
  },
  emptyProjectsText: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: "500",
  },
  projectAccordion: {
    marginBottom: 4,
  },
  projectHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  projectTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
    flex: 1,
  },
  taskCountBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    backgroundColor: "#E2E8F0",
  },
  taskCountBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.muted,
  },
  projectTasksList: {
    paddingLeft: 18,
    paddingRight: 6,
    gap: 2,
    marginTop: 2,
  },
  taskRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 6,
  },
  taskRowTitle: {
    fontSize: 12,
    color: colors.text,
  },
  taskRowTitleDone: {
    textDecorationLine: "line-through",
    color: colors.muted,
  },
  inlineAddTask: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
  },
  inlineInput: {
    flex: 1,
    height: 32,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    paddingHorizontal: 8,
    fontSize: 12,
    backgroundColor: "#FFF",
  },
  inlineSaveBtn: {
    backgroundColor: colors.blueDark,
    padding: 6,
    borderRadius: 6,
  },
  inlineCancelBtn: {
    padding: 6,
  },
  tagBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  tagBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  projectChoice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: "#EEEEF0",
    borderWidth: 1,
    borderColor: "transparent",
  },
  projectChoiceActive: {
    backgroundColor: colors.text,
  },
  projectChoiceText: {
    fontSize: 12,
    fontWeight: "500",
    color: colors.text,
  },
  projectChoiceTextActive: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  searchBarContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 9,
    height: 34,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    color: colors.text,
    paddingVertical: 0,
    height: "100%",
  },
  clearSearchBtn: {
    padding: 3,
  },
  tagFilterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: "#EEEEF0",
    borderWidth: 1,
    borderColor: "transparent",
  },
  tagFilterChipActive: {
    backgroundColor: colors.text,
  },
  tagFilterChipText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.muted,
  },
  tagFilterChipTextActive: {
    color: "#FFFFFF",
  },
  tagFilterBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 6,
    backgroundColor: "rgba(0,0,0,0.08)",
  },
  tagFilterBadgeText: {
    fontSize: 9.5,
    fontWeight: "700",
    color: colors.text,
  },
  filterActiveBar: {
    paddingVertical: 3,
    paddingHorizontal: 4,
  },
  filterActiveText: {
    fontSize: 10.5,
    color: colors.blueDark,
    fontWeight: "600",
  },
  clearFilterLink: {
    fontSize: 10.5,
    color: colors.muted,
    textDecorationLine: "underline",
    fontWeight: "500",
  },
  noFilterResults: {
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#EAEAEA",
    marginHorizontal: 4,
    marginVertical: 4,
  },
  noFilterResultsText: {
    fontSize: 12,
    color: colors.muted,
    textAlign: "center",
  },
});
