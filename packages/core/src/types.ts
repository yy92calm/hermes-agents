export interface ExpertSkill {
  name: string
  description: string
  instructions?: string[]
}

export interface ExpertRule {
  title: string
  content: string[]
}

export interface ExpertMcpServer {
  name: string
  command: string[]
  description?: string
  type?: "local" | "remote"
  env?: Record<string, string>
}

export interface ExpertAgentConfig {
  model?: string
  temperature?: number
  permissions?: Record<string, "allow" | "deny" | "ask">
  color?: string
  maxSteps?: number
}

export interface ExpertAgent {
  name: string
  role: string
  description: string
  instructions: string[]
  tools?: Record<string, boolean>
  agentConfig?: ExpertAgentConfig
  skills?: ExpertSkill[]
  rules?: ExpertRule[]
  mcpServers?: ExpertMcpServer[]
}

export type OrchestrationStrategy = "sequential" | "parallel" | "debate" | "pipeline"

export interface ExpertTeam {
  name: string
  description: string
  version: string
  agents: ExpertAgent[]
  orchestration?: {
    strategy: OrchestrationStrategy
    maxConcurrency?: number
  }
}

export interface PluginGenerationResult {
  success: boolean
  pluginPath?: string
  generatedFiles?: string[]
  error?: string
}

export interface TeamFile {
  team: ExpertTeam
  updatedAt: string
}
