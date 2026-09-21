export interface ChannelOwnershipInput {
  instanceId: string | null;
  conversationInstanceId: string | null;
  boundAgentId: string | null;
  speakingAgentId: string | null;
  agentActive: boolean;
  agentActiveInWhatsapp: boolean;
  stampWriteOk: boolean;
}

export interface ChannelOwnershipDecision {
  allowed: boolean;
  reason: string | null;
}

export function evaluateChannelOwnership(
  input: ChannelOwnershipInput,
): ChannelOwnershipDecision {
  if (!input.stampWriteOk) {
    return { allowed: false, reason: "channel_stamp_failed" };
  }
  if (!input.instanceId) {
    return { allowed: false, reason: "no_instance" };
  }
  if (
    input.conversationInstanceId &&
    input.conversationInstanceId !== input.instanceId
  ) {
    return { allowed: false, reason: "instance_mismatch" };
  }
  if (!input.boundAgentId) {
    return { allowed: false, reason: "unbound_instance" };
  }
  if (!input.speakingAgentId || input.speakingAgentId !== input.boundAgentId) {
    return { allowed: false, reason: "owner_mismatch" };
  }
  if (!input.agentActive || !input.agentActiveInWhatsapp) {
    return { allowed: false, reason: "agent_inactive" };
  }
  return { allowed: true, reason: null };
}
