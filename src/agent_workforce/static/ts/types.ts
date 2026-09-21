export interface Agent {
  id: string;
  name: string;
  role: string;
  role_type: "researcher" | "worker";
  avatar: string;
  provider: string;
  model: string;
  instructions: string;
  status: string;
  jobs_done: number;
  jobs_completed: number;
  total_cost: number;
}

export interface Job {
  id: string;
  agent_id: string;
  input: string;
  status: string;
  output: string | null;
  error: string | null;
  tools_used: string[];
  cost: number | null;
}

export interface WorkflowStep extends Job {
  agent_name: string;
}

export interface Workflow {
  id: string;
  name: string;
  agent_ids: string[];
}

export interface WorkflowRun {
  id: string;
  workflow_id: string;
  status: string;
  input: string;
  steps: WorkflowStep[];
}

export interface Automation {
  id: string;
  workflow_id: string;
  schedule_type: "interval" | "daily";
  interval_minutes: number | null;
  daily_at: string | null;
  input: string;
  enabled: boolean;
  next_run_at: number | null;
  last_run_at: number | null;
  last_run_status: string | null;
}

export interface InfrastructureItem {
  key: string;
  label: string;
  enabled: boolean;
}

export interface Usage {
  total_cost: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_jobs: number;
  today_cost: number;
}

export interface Settings {
  daily_spend_limit: number | null;
  recovery_threshold: number | null;
  emergency_stop: boolean;
  operating_mode: "running" | "recovery" | "emergency_stop";
}

export interface JobEvent {
  id: string;
  job_id: string;
  label: string;
  created_at: number;
}

export interface ActivityEvent {
  ts: number;
  label: string;
}

export interface PlanStep {
  name: string;
  role: string;
  provider: string;
  model: string;
  capabilities: string[];
  instructions: string;
}

export interface Plan {
  id: string;
  objective: string;
  summary: string;
  steps: PlanStep[];
  warnings: string[];
  status: "proposed" | "approved" | "rejected";
  workflow_id: string | null;
  opportunity_id: string | null;
}

export interface Opportunity {
  id: string;
  title: string;
  description: string;
  status: string;
  forecast_value: number | null;
  workflow_id: string | null;
  notes: string | null;
  created_at: number;
  updated_at: number;
}

export interface OrchestratorMessage {
  id: string;
  role: "owner" | "orchestrator";
  content: string;
  created_at: number;
}

export interface AgentDraft {
  name: string;
  role: string;
  role_type: "researcher" | "worker";
  instructions: string;
  capabilities_override: string[] | null;
}

export interface Ledger {
  balance: number;
  recovery_mode: boolean;
  mode: "running" | "recovery" | "emergency_stop";
  entries: { id: string; kind: string; amount: number; note: string; created_at: number }[];
}
