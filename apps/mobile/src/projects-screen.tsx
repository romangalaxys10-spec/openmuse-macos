import {
  Archive,
  ArrowRight,
  CheckCircle2,
  Circle,
  Clock,
  FolderGit2,
  FolderKanban,
  MessageCircle,
  MoreVertical,
  Plus,
  Trash2,
  XCircle,
} from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { Project, ProjectTask } from "../../../packages/domain/src";
import { useMuseThread } from "./threads";
import {
  Button,
  Card,
  Chip,
  colors,
  Empty,
  ErrorNotice,
  Field,
  IconButton,
  s,
  Sheet,
} from "./ui";
import { useWorkspace } from "./workspace";

export const PROJECT_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  blue: { bg: "#EBF5FF", text: "#1E40AF", dot: "#3B82F6" },
  green: { bg: "#ECFDF5", text: "#065F46", dot: "#10B981" },
  purple: { bg: "#F3E8FF", text: "#6B21A8", dot: "#8B5CF6" },
  amber: { bg: "#FEF3C7", text: "#92400E", dot: "#F59E0B" },
  rose: { bg: "#FFE4E6", text: "#9F1239", dot: "#F43F5E" },
  slate: { bg: "#F1F5F9", text: "#334155", dot: "#64748B" },
};

export function ProjectsScreen() {
  const { api, navigate, notify } = useWorkspace();
  const { select, start } = useMuseThread();

  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedProjectId, setSelectedProjectId] = useState<string | "all">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "done">("all");

  // New Project modal state
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDesc, setNewProjectDesc] = useState("");
  const [newProjectColor, setNewProjectColor] = useState("blue");
  const [submittingProject, setSubmittingProject] = useState(false);

  // New Task modal state
  const [showNewTaskModal, setShowNewTaskModal] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDesc, setNewTaskDesc] = useState("");
  const [newTaskProjectId, setNewTaskProjectId] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<"low" | "medium" | "high">("medium");
  const [submittingTask, setSubmittingTask] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [projs, tsks] = await Promise.all([
        api.request<Project[]>("/api/projects"),
        api.request<ProjectTask[]>("/api/project-tasks"),
      ]);
      setProjects(projs);
      setTasks(tsks);
    } catch (err: any) {
      setError(err?.message || "Failed to load projects and tasks");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    setSubmittingProject(true);
    try {
      const created = await api.request<Project>(
        "/api/projects",
        {
          name: newProjectName.trim(),
          description: newProjectDesc.trim(),
          color: newProjectColor,
          status: "active",
        },
        "POST",
      );
      setProjects((prev) => [...prev, created]);
      setShowNewProjectModal(false);
      setNewProjectName("");
      setNewProjectDesc("");
      notify(`Project "${created.name}" created`);
    } catch (err: any) {
      notify(err?.message || "Failed to create project");
    } finally {
      setSubmittingProject(false);
    }
  };

  const handleCreateTask = async () => {
    if (!newTaskTitle.trim()) return;
    const targetProjectId =
      newTaskProjectId ||
      (selectedProjectId !== "all" ? selectedProjectId : projects[0]?.id || "default");

    setSubmittingTask(true);
    try {
      const created = await api.request<ProjectTask>(
        "/api/project-tasks",
        {
          title: newTaskTitle.trim(),
          description: newTaskDesc.trim(),
          projectId: targetProjectId,
          priority: newTaskPriority,
          status: "todo",
        },
        "POST",
      );
      setTasks((prev) => [...prev, created]);
      setShowNewTaskModal(false);
      setNewTaskTitle("");
      setNewTaskDesc("");
      notify(`Task "${created.title}" added`);
    } catch (err: any) {
      notify(err?.message || "Failed to add task");
    } finally {
      setSubmittingTask(false);
    }
  };

  const handleToggleTaskStatus = async (task: ProjectTask) => {
    const nextStatusMap: Record<ProjectTask["status"], ProjectTask["status"]> = {
      todo: "in_progress",
      in_progress: "done",
      done: "todo",
      cancelled: "todo",
    };
    const nextStatus = nextStatusMap[task.status] || "todo";
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

  const handleDeleteTask = async (taskId: string) => {
    try {
      await api.request(`/api/project-tasks/${taskId}`, {}, "DELETE");
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      notify("Task deleted");
    } catch (err: any) {
      notify(err?.message || "Failed to delete task");
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    try {
      await api.request(`/api/projects/${projectId}`, {}, "DELETE");
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
      if (selectedProjectId === projectId) setSelectedProjectId("all");
      notify("Project removed");
    } catch (err: any) {
      notify(err?.message || "Failed to delete project");
    }
  };

  const handleOpenTaskChat = (task: ProjectTask) => {
    if (task.threadId) {
      select({ id: task.threadId, existing: true });
      navigate("chat");
    } else {
      // Start a new thread for this task and associate it
      start();
      navigate("chat");
      notify(`Started agent session for "${task.title}"`);
    }
  };

  const filteredTasks = tasks.filter((t) => {
    if (selectedProjectId !== "all" && t.projectId !== selectedProjectId) return false;
    if (statusFilter === "active" && (t.status === "done" || t.status === "cancelled")) return false;
    if (statusFilter === "done" && t.status !== "done") return false;
    return true;
  });

  const todoCount = tasks.filter((t) => t.status === "todo").length;
  const inProgressCount = tasks.filter((t) => t.status === "in_progress").length;
  const doneCount = tasks.filter((t) => t.status === "done").length;

  return (
    <View style={{ gap: 20 }}>
      {/* Top summary stats */}
      <View style={styles.statsRow}>
        <Card style={styles.statCard}>
          <Text style={styles.statValue}>{projects.length}</Text>
          <Text style={styles.statLabel}>Projects</Text>
        </Card>
        <Card style={styles.statCard}>
          <Text style={[styles.statValue, { color: colors.blueDark }]}>{todoCount}</Text>
          <Text style={styles.statLabel}>To Do</Text>
        </Card>
        <Card style={styles.statCard}>
          <Text style={[styles.statValue, { color: "#F59E0B" }]}>{inProgressCount}</Text>
          <Text style={styles.statLabel}>In Progress</Text>
        </Card>
        <Card style={styles.statCard}>
          <Text style={[styles.statValue, { color: "#10B981" }]}>{doneCount}</Text>
          <Text style={styles.statLabel}>Completed</Text>
        </Card>
      </View>

      {/* Action Bar */}
      <View style={[s.between, { flexWrap: "wrap", gap: 10 }]}>
        <View style={[s.row, { gap: 8, flexWrap: "wrap" }]}>
          <Button
            small
            icon={Plus}
            primary
            onPress={() => {
              setNewTaskProjectId(selectedProjectId !== "all" ? selectedProjectId : projects[0]?.id || "");
              setShowNewTaskModal(true);
            }}
          >
            New Task
          </Button>
          <Button
            small
            icon={FolderGit2}
            onPress={() => setShowNewProjectModal(true)}
          >
            New Project
          </Button>
        </View>

        {/* Filter Pills */}
        <View style={[s.row, { gap: 6 }]}>
          <Pressable
            onPress={() => setStatusFilter("all")}
            style={[styles.filterChip, statusFilter === "all" && styles.filterChipActive]}
          >
            <Text style={[styles.filterChipText, statusFilter === "all" && styles.filterChipTextActive]}>
              All
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setStatusFilter("active")}
            style={[styles.filterChip, statusFilter === "active" && styles.filterChipActive]}
          >
            <Text style={[styles.filterChipText, statusFilter === "active" && styles.filterChipTextActive]}>
              Active
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setStatusFilter("done")}
            style={[styles.filterChip, statusFilter === "done" && styles.filterChipActive]}
          >
            <Text style={[styles.filterChipText, statusFilter === "done" && styles.filterChipTextActive]}>
              Done
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Project selector scroll tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        <Pressable
          onPress={() => setSelectedProjectId("all")}
          style={[
            styles.projectTab,
            selectedProjectId === "all" && styles.projectTabActive,
          ]}
        >
          <Text
            style={[
              styles.projectTabText,
              selectedProjectId === "all" && styles.projectTabTextActive,
            ]}
          >
            All Projects ({tasks.length})
          </Text>
        </Pressable>

        {projects.map((proj) => {
          const colorMeta = PROJECT_COLORS[proj.color || "blue"] || PROJECT_COLORS.blue;
          const count = tasks.filter((t) => t.projectId === proj.id).length;
          const isSelected = selectedProjectId === proj.id;
          return (
            <Pressable
              key={proj.id}
              onPress={() => setSelectedProjectId(proj.id)}
              style={[
                styles.projectTab,
                isSelected && { borderColor: colorMeta.dot, backgroundColor: colorMeta.bg },
              ]}
            >
              <View style={[styles.colorDot, { backgroundColor: colorMeta.dot }]} />
              <Text
                style={[
                  styles.projectTabText,
                  isSelected && { color: colorMeta.text, fontWeight: "700" },
                ]}
              >
                {proj.name} ({count})
              </Text>
              {isSelected && (
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation();
                    void handleDeleteProject(proj.id);
                  }}
                  style={{ marginLeft: 4 }}
                >
                  <Trash2 size={13} color={colors.muted} />
                </Pressable>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Task List */}
      {loading ? (
        <ActivityIndicator color={colors.blueDark} style={{ padding: 40 }} />
      ) : filteredTasks.length === 0 ? (
        <Card>
          <Empty
            icon={FolderKanban}
            title="No tasks found"
            detail="Create a task or project to organize what you and OpenMuse are working on."
          >
            <Button
              primary
              icon={Plus}
              onPress={() => setShowNewTaskModal(true)}
            >
              Add First Task
            </Button>
          </Empty>
        </Card>
      ) : (
        <View style={{ gap: 10 }}>
          {filteredTasks.map((task) => {
            const project = projects.find((p) => p.id === task.projectId);
            const colorMeta = PROJECT_COLORS[project?.color || "blue"] || PROJECT_COLORS.blue;

            return (
              <Card key={task.id} style={styles.taskCard}>
                <View style={[s.between, { alignItems: "flex-start", gap: 12 }]}>
                  {/* Status Toggle & Title */}
                  <View style={[s.row, { gap: 12, flex: 1, alignItems: "flex-start" }]}>
                    <Pressable
                      onPress={() => void handleToggleTaskStatus(task)}
                      style={{ marginTop: 2 }}
                    >
                      {task.status === "done" ? (
                        <CheckCircle2 size={20} color="#10B981" />
                      ) : task.status === "in_progress" ? (
                        <Clock size={20} color="#F59E0B" />
                      ) : task.status === "cancelled" ? (
                        <XCircle size={20} color={colors.muted} />
                      ) : (
                        <Circle size={20} color={colors.muted} />
                      )}
                    </Pressable>

                    <View style={{ flex: 1, gap: 4 }}>
                      <Text
                        style={[
                          styles.taskTitle,
                          task.status === "done" && styles.taskTitleDone,
                        ]}
                      >
                        {task.title}
                      </Text>
                      {!!task.description && (
                        <Text style={styles.taskDesc} numberOfLines={2}>
                          {task.description}
                        </Text>
                      )}

                      {/* Badges */}
                      <View style={[s.row, { gap: 6, flexWrap: "wrap", marginTop: 4 }]}>
                        {project && (
                          <View
                            style={[
                              styles.miniBadge,
                              { backgroundColor: colorMeta.bg },
                            ]}
                          >
                            <View style={[styles.colorDot, { backgroundColor: colorMeta.dot, width: 6, height: 6 }]} />
                            <Text style={[styles.miniBadgeText, { color: colorMeta.text }]}>
                              {project.name}
                            </Text>
                          </View>
                        )}
                        <View
                          style={[
                            styles.miniBadge,
                            task.priority === "high"
                              ? { backgroundColor: "#FEE2E2" }
                              : task.priority === "medium"
                                ? { backgroundColor: "#FEF3C7" }
                                : { backgroundColor: "#F1F5F9" },
                          ]}
                        >
                          <Text
                            style={[
                              styles.miniBadgeText,
                              task.priority === "high"
                                ? { color: "#991B1B" }
                                : task.priority === "medium"
                                  ? { color: "#92400E" }
                                  : { color: "#475569" },
                            ]}
                          >
                            {task.priority || "medium"}
                          </Text>
                        </View>
                        <View style={styles.miniBadge}>
                          <Text style={[styles.miniBadgeText, { color: colors.muted }]}>
                            {task.status}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>

                  {/* Task Right Actions */}
                  <View style={[s.row, { gap: 6 }]}>
                    <Pressable
                      onPress={() => handleOpenTaskChat(task)}
                      style={styles.chatActionBtn}
                    >
                      <MessageCircle size={15} color={colors.blueDark} />
                      <Text style={styles.chatActionText}>Agent</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => void handleDeleteTask(task.id)}
                      style={styles.deleteBtn}
                    >
                      <Trash2 size={15} color={colors.muted} />
                    </Pressable>
                  </View>
                </View>
              </Card>
            );
          })}
        </View>
      )}

      {/* New Project Modal */}
      {showNewProjectModal && (
        <Sheet
          title="New Project"
          subtitle="Group tasks and agent sessions into a shared workspace."
          onClose={() => setShowNewProjectModal(false)}
        >
          <View style={{ gap: 16 }}>
            <Field
              label="Project Name"
              placeholder="e.g. Website Redesign, Marketing Q3"
              value={newProjectName}
              onChangeText={setNewProjectName}
            />
            <Field
              label="Description (optional)"
              placeholder="Brief summary of goals and deliverables"
              value={newProjectDesc}
              onChangeText={setNewProjectDesc}
              multiline
            />

            <View style={{ gap: 8 }}>
              <Text style={[s.small, { fontWeight: "600", color: colors.text }]}>
                Color Tag
              </Text>
              <View style={[s.row, { gap: 10 }]}>
                {Object.keys(PROJECT_COLORS).map((cKey) => {
                  const cMeta = PROJECT_COLORS[cKey];
                  const selected = newProjectColor === cKey;
                  return (
                    <Pressable
                      key={cKey}
                      onPress={() => setNewProjectColor(cKey)}
                      style={[
                        styles.colorPickerCircle,
                        { backgroundColor: cMeta.dot },
                        selected && styles.colorPickerSelected,
                      ]}
                    />
                  );
                })}
              </View>
            </View>

            <View style={[s.row, { justifyContent: "flex-end", gap: 10, marginTop: 12 }]}>
              <Button small onPress={() => setShowNewProjectModal(false)}>
                Cancel
              </Button>
              <Button
                small
                primary
                busy={submittingProject}
                onPress={() => void handleCreateProject()}
              >
                Create Project
              </Button>
            </View>
          </View>
        </Sheet>
      )}

      {/* New Task Modal */}
      {showNewTaskModal && (
        <Sheet
          title="New Task"
          subtitle="Add a task under a project for you and the AI agent."
          onClose={() => setShowNewTaskModal(false)}
        >
          <View style={{ gap: 16 }}>
            <Field
              label="Task Title"
              placeholder="e.g. Scrape competitors pricing, Write landing copy"
              value={newTaskTitle}
              onChangeText={setNewTaskTitle}
            />
            <Field
              label="Description (optional)"
              placeholder="Additional instructions or notes"
              value={newTaskDesc}
              onChangeText={setNewTaskDesc}
              multiline
            />

            {projects.length > 0 && (
              <View style={{ gap: 8 }}>
                <Text style={[s.small, { fontWeight: "600", color: colors.text }]}>
                  Project
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {projects.map((p) => {
                    const sel = newTaskProjectId === p.id;
                    const c = PROJECT_COLORS[p.color || "blue"] || PROJECT_COLORS.blue;
                    return (
                      <Pressable
                        key={p.id}
                        onPress={() => setNewTaskProjectId(p.id)}
                        style={[
                          styles.projectTab,
                          sel && { backgroundColor: c.bg, borderColor: c.dot },
                        ]}
                      >
                        <View style={[styles.colorDot, { backgroundColor: c.dot }]} />
                        <Text style={[styles.projectTabText, sel && { color: c.text, fontWeight: "700" }]}>
                          {p.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            <View style={{ gap: 8 }}>
              <Text style={[s.small, { fontWeight: "600", color: colors.text }]}>
                Priority
              </Text>
              <View style={[s.row, { gap: 10 }]}>
                {(["low", "medium", "high"] as const).map((p) => {
                  const sel = newTaskPriority === p;
                  return (
                    <Pressable
                      key={p}
                      onPress={() => setNewTaskPriority(p)}
                      style={[
                        styles.priorityChoice,
                        sel && styles.priorityChoiceActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.priorityChoiceText,
                          sel && styles.priorityChoiceTextActive,
                        ]}
                      >
                        {p.toUpperCase()}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={[s.row, { justifyContent: "flex-end", gap: 10, marginTop: 12 }]}>
              <Button small onPress={() => setShowNewTaskModal(false)}>
                Cancel
              </Button>
              <Button
                small
                primary
                busy={submittingTask}
                onPress={() => void handleCreateTask()}
              >
                Add Task
              </Button>
            </View>
          </View>
        </Sheet>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  statsRow: {
    flexDirection: "row",
    gap: 12,
  },
  statCard: {
    flex: 1,
    padding: 14,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.text,
  },
  statLabel: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 2,
    fontWeight: "500",
  },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: "#EEEEF0",
  },
  filterChipActive: {
    backgroundColor: colors.text,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.muted,
  },
  filterChipTextActive: {
    color: "#FFFFFF",
  },
  projectTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: "#F4F5F6",
    borderWidth: 1,
    borderColor: "transparent",
  },
  projectTabActive: {
    backgroundColor: "#FFFFFF",
    borderColor: colors.line,
  },
  projectTabText: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.text,
  },
  projectTabTextActive: {
    fontWeight: "700",
  },
  colorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  taskCard: {
    padding: 14,
    borderRadius: 16,
  },
  taskTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
    lineHeight: 20,
  },
  taskTitleDone: {
    textDecorationLine: "line-through",
    color: colors.muted,
  },
  taskDesc: {
    fontSize: 12,
    color: colors.muted,
    lineHeight: 18,
  },
  miniBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: "#F1F2F3",
  },
  miniBadgeText: {
    fontSize: 10,
    fontWeight: "600",
  },
  chatActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: colors.sky,
  },
  chatActionText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.blueDark,
  },
  deleteBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: "#F4F5F6",
  },
  colorPickerCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  colorPickerSelected: {
    borderWidth: 3,
    borderColor: "#11191C",
  },
  priorityChoice: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: "#EEEEF0",
  },
  priorityChoiceActive: {
    backgroundColor: colors.text,
  },
  priorityChoiceText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.muted,
  },
  priorityChoiceTextActive: {
    color: "#FFFFFF",
  },
});
