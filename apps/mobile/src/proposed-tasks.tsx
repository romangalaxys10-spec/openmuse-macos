import {
  Check,
  CheckCircle2,
  Circle,
  FolderGit2,
  FolderKanban,
  ListPlus,
  Plus,
  Sparkles,
  X,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { Project, ProjectTask, SessionMeta } from "../../../packages/domain/src";
import type { AgentTask } from "../../../packages/domain/src/agent";
import { PROJECT_COLORS } from "./projects-screen";
import { Button, Card, colors, s } from "./ui";
import { useWorkspace } from "./workspace";

export function extractMilestonesFromText(text: string): string[] {
  if (!text) return [];
  const lines = text.split("\n");
  const milestones: string[] = [];
  let inPlanSection = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (
      /^(#+\s*)?(action plan|next steps|milestones|tasks to complete|steps to take|implementation plan|plan):?/i.test(
        line,
      )
    ) {
      inPlanSection = true;
      continue;
    }

    const numberedMatch = line.match(/^(\d+)[\.\)]\s+(?:\*\*)?([^*\n]+)(?:\*\*)?/);
    if (numberedMatch) {
      const title = numberedMatch[2]
        .replace(/^\[[ x]\]\s*/i, "")
        .replace(/\*\*/g, "")
        .trim();
      if (title.length >= 5 && title.length <= 140 && !title.endsWith("?")) {
        milestones.push(title);
        continue;
      }
    }

    const checklistMatch = line.match(/^[-*•]\s+\[[ x]\]\s+(.+)$/i);
    if (checklistMatch) {
      const title = checklistMatch[1].replace(/\*\*/g, "").trim();
      if (title.length >= 5 && title.length <= 140) {
        milestones.push(title);
        continue;
      }
    }

    const boldBulletMatch = line.match(/^[-*•]\s+\*\*([^*]+)\*\*:?\s*(.*)$/);
    if (boldBulletMatch) {
      const lead = boldBulletMatch[1].trim();
      const rest = boldBulletMatch[2].trim();
      const title = rest.length > 5 ? `${lead}: ${rest}` : lead;
      if (title.length >= 5 && title.length <= 140 && !title.endsWith("?")) {
        milestones.push(title);
        continue;
      }
    }

    if (inPlanSection) {
      const bulletMatch = line.match(/^[-*•]\s+(.+)$/);
      if (bulletMatch) {
        const title = bulletMatch[1].replace(/\*\*/g, "").trim();
        if (title.length >= 5 && title.length <= 140 && !title.endsWith("?")) {
          milestones.push(title);
        }
      }
    }
  }

  return Array.from(new Set(milestones)).slice(0, 8);
}

export function ProposedTasksCard({
  threadId,
  messages,
  isRunning,
  agentTasks,
}: {
  threadId: string;
  messages: Array<{ id?: string; role?: string; content?: unknown }>;
  isRunning: boolean;
  agentTasks?: AgentTask[];
}) {
  const { api, navigate, notify } = useWorkspace();

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedMilestones, setSelectedMilestones] = useState<Record<string, boolean>>({});
  const [dismissedMessageIds, setDismissedMessageIds] = useState<Record<string, boolean>>({});
  const [addedMessageIds, setAddedMessageIds] = useState<Record<string, { count: number; projectName: string }>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Find latest assistant message
  const lastAssistantMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === "assistant" && typeof m.content === "string" && m.content.trim()) {
        return m;
      }
    }
    return null;
  }, [messages]);

  const messageKey = lastAssistantMessage?.id || String(messages.length);

  // Extract candidate milestones
  const candidateMilestones = useMemo(() => {
    // 1. Check if agent tasks have plan steps
    const taskPlanSteps: string[] = [];
    if (agentTasks && agentTasks.length > 0) {
      for (const t of agentTasks) {
        if (t.plan && t.plan.length > 0) {
          for (const step of t.plan) {
            if (step.title && step.title.length >= 4) {
              taskPlanSteps.push(step.title);
            }
          }
        }
      }
    }
    if (taskPlanSteps.length > 0) {
      return Array.from(new Set(taskPlanSteps)).slice(0, 8);
    }

    // 2. Extract from last assistant message text
    if (lastAssistantMessage && typeof lastAssistantMessage.content === "string") {
      return extractMilestonesFromText(lastAssistantMessage.content);
    }

    return [];
  }, [agentTasks, lastAssistantMessage]);

  // Load projects and current thread metadata
  useEffect(() => {
    let active = true;
    Promise.all([
      api.request<Project[]>("/api/projects").catch(() => []),
      api.request<SessionMeta>(`/api/threads/${threadId}/meta`).catch(() => ({ id: threadId } as SessionMeta)),
    ]).then(([projs, meta]) => {
      if (!active) return;
      setProjects(projs);
      if (meta.projectId && projs.some((p) => p.id === meta.projectId)) {
        setSelectedProjectId(meta.projectId);
      } else if (projs.length > 0) {
        setSelectedProjectId(projs[0].id);
      }
    });
    return () => {
      active = false;
    };
  }, [api, threadId]);

  // Initialize selected checkboxes whenever candidate milestones change
  useEffect(() => {
    const initial: Record<string, boolean> = {};
    for (const m of candidateMilestones) {
      initial[m] = true;
    }
    setSelectedMilestones(initial);
  }, [candidateMilestones]);

  const toggleMilestone = (milestone: string) => {
    setSelectedMilestones((prev) => ({
      ...prev,
      [milestone]: !prev[milestone],
    }));
  };

  const handleAddTasks = async () => {
    const chosen = candidateMilestones.filter((m) => selectedMilestones[m]);
    if (!chosen.length) return;

    let targetProjectId = selectedProjectId;

    // If no project exists yet, automatically create a default one
    if (!targetProjectId) {
      try {
        const createdProj = await api.request<Project>(
          "/api/projects",
          { name: "My Project", color: "blue", status: "active" },
          "POST",
        );
        targetProjectId = createdProj.id;
        setProjects((prev) => [...prev, createdProj]);
        setSelectedProjectId(targetProjectId);
      } catch (err: any) {
        notify("Failed to initialize project");
        return;
      }
    }

    setIsSubmitting(true);
    try {
      // Create project tasks
      await Promise.all(
        chosen.map((title) =>
          api.request<ProjectTask>(
            "/api/project-tasks",
            {
              title,
              projectId: targetProjectId,
              threadId,
              status: "todo",
              priority: "medium",
            },
            "POST",
          ),
        ),
      );

      // Link thread to this project if not already linked
      await api
        .request(`/api/threads/${threadId}/meta`, { projectId: targetProjectId }, "PATCH")
        .catch(() => {});

      const targetProj = projects.find((p) => p.id === targetProjectId);
      const projName = targetProj?.name || "Project";

      setAddedMessageIds((prev) => ({
        ...prev,
        [messageKey]: { count: chosen.length, projectName: projName },
      }));

      notify(`Added ${chosen.length} milestone task${chosen.length > 1 ? "s" : ""} to "${projName}"`);
    } catch (err: any) {
      notify(err?.message || "Failed to add tasks");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDismiss = () => {
    setDismissedMessageIds((prev) => ({
      ...prev,
      [messageKey]: true,
    }));
  };

  // Check display conditions
  if (isRunning) return null;
  if (!candidateMilestones.length) return null;
  if (dismissedMessageIds[messageKey]) return null;

  const addedRecord = addedMessageIds[messageKey];

  if (addedRecord) {
    return (
      <View style={styles.successCard}>
        <View style={[s.row, { gap: 8, flex: 1 }]}>
          <CheckCircle2 size={18} color="#10B981" />
          <Text style={styles.successText}>
            Added {addedRecord.count} milestone task{addedRecord.count > 1 ? "s" : ""} to{" "}
            <Text style={{ fontWeight: "700" }}>{addedRecord.projectName}</Text>
          </Text>
        </View>
        <Pressable
          onPress={() => navigate("projects")}
          style={styles.viewTasksLink}
        >
          <Text style={styles.viewTasksText}>View Tasks</Text>
        </Pressable>
      </View>
    );
  }

  const selectedCount = candidateMilestones.filter((m) => selectedMilestones[m]).length;
  const currentProject = projects.find((p) => p.id === selectedProjectId);
  const pColor = currentProject
    ? PROJECT_COLORS[currentProject.color || "blue"] || PROJECT_COLORS.blue
    : PROJECT_COLORS.blue;

  return (
    <View style={styles.cardContainer}>
      <View style={[s.between, { marginBottom: 8 }]}>
        <View style={[s.row, { gap: 8 }]}>
          <View style={styles.iconCircle}>
            <ListPlus size={16} color={colors.blueDark} />
          </View>
          <View>
            <Text style={styles.cardTitle}>Action Plan Milestones</Text>
            <Text style={styles.cardSubtitle}>
              Auto-generate project tasks from this conversation
            </Text>
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss plan proposal"
          onPress={handleDismiss}
          style={styles.dismissBtn}
        >
          <X size={15} color={colors.muted} />
        </Pressable>
      </View>

      {/* Project Selector Chips */}
      {projects.length > 0 && (
        <View style={{ marginBottom: 10 }}>
          <Text style={[s.small, { marginBottom: 6, fontWeight: "600", color: colors.text }]}>
            Destination Project:
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {projects.map((proj) => {
              const sel = proj.id === selectedProjectId;
              const c = PROJECT_COLORS[proj.color || "blue"] || PROJECT_COLORS.blue;
              return (
                <Pressable
                  key={proj.id}
                  onPress={() => setSelectedProjectId(proj.id)}
                  style={[
                    styles.projectPill,
                    sel && { backgroundColor: c.bg, borderColor: c.dot },
                  ]}
                >
                  <View style={[styles.colorDot, { backgroundColor: c.dot }]} />
                  <Text
                    style={[
                      styles.projectPillText,
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

      {/* Milestone Checkbox Items */}
      <View style={styles.milestonesList}>
        {candidateMilestones.map((milestone) => {
          const isChecked = !!selectedMilestones[milestone];
          return (
            <Pressable
              key={milestone}
              onPress={() => toggleMilestone(milestone)}
              style={styles.milestoneRow}
            >
              {isChecked ? (
                <CheckCircle2 size={16} color={colors.blueDark} />
              ) : (
                <Circle size={16} color={colors.muted} />
              )}
              <Text
                style={[
                  styles.milestoneText,
                  !isChecked && styles.milestoneTextUnchecked,
                ]}
              >
                {milestone}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Action Buttons */}
      <View style={[s.row, { justifyContent: "space-between", marginTop: 12 }]}>
        <Button small onPress={handleDismiss}>
          Dismiss
        </Button>
        <Button
          small
          primary
          busy={isSubmitting}
          disabled={selectedCount === 0}
          icon={Plus}
          onPress={handleAddTasks}
        >
          Add {selectedCount} Task{selectedCount !== 1 ? "s" : ""} to {currentProject?.name || "Project"}
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    padding: 14,
    borderRadius: 18,
    backgroundColor: "#F4F8FD",
    borderWidth: 1,
    borderColor: "#D3E5F9",
    marginTop: 8,
    marginBottom: 6,
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#E1EEFC",
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  cardSubtitle: {
    fontSize: 11,
    color: colors.muted,
  },
  dismissBtn: {
    padding: 6,
    borderRadius: 6,
  },
  projectPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  projectPillText: {
    fontSize: 11,
    fontWeight: "500",
    color: colors.text,
  },
  colorDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  milestonesList: {
    gap: 6,
    backgroundColor: "#FFFFFF",
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5EDF6",
  },
  milestoneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 2,
  },
  milestoneText: {
    fontSize: 12.5,
    color: colors.text,
    lineHeight: 18,
    flex: 1,
  },
  milestoneTextUnchecked: {
    color: colors.muted,
    textDecorationLine: "line-through",
  },
  successCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
    marginTop: 8,
    marginBottom: 6,
  },
  successText: {
    fontSize: 12.5,
    color: "#065F46",
    flex: 1,
  },
  viewTasksLink: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: "#D1FAE5",
  },
  viewTasksText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#047857",
  },
});
