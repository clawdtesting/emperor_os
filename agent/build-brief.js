// /home/ubuntu/emperor_OS/.openclaw/workspace/agent/build-brief.js
function inferAudience(job) {
    const text = `${job.title ?? ""}\n${job.details ?? ""}\n${JSON.stringify(job.rawSpec ?? {})}`;
  
    if (/beginner|newbie|plain language|simple terms|non-technical/i.test(text)) {
      return "beginner";
    }
  
    if (job.category === "development") return "technical";
    if (job.category === "analysis" || job.category === "research") return "professional";
    return "general";
  }
  
  function inferTone(job) {
    const text = `${job.title ?? ""}\n${job.details ?? ""}`;
  
    if (/plain language|simple|high-level/i.test(text)) return "clear and educational";
    if (job.category === "analysis" || job.category === "research") return "clear, analytical, and structured";
    if (job.category === "development") return "technical, exact, and practical";
    if (job.category === "creative") return "engaging but controlled";
    return "clear and direct";
  }
  
  function inferConstraints(job) {
    const text = `${job.title ?? ""}\n${job.details ?? ""}\n${JSON.stringify(job.rawSpec ?? {})}`;
    const constraints = [
      "no meta commentary",
      "no filler",
      "follow required sections exactly",
      "output only final markdown content"
    ];
  
    if (/no solidity/i.test(text)) constraints.push("do not include Solidity code");
    if (/high-level only/i.test(text)) constraints.push("keep the explanation high-level");
    if (/use analogies/i.test(text)) constraints.push("include useful analogies");
    if (/plain language|beginner|newbie/i.test(text)) constraints.push("write for a beginner audience");
    if (/single markdown file/i.test(text)) constraints.push("produce a single markdown deliverable");
  
    return [...new Set(constraints)];
  }
  
  function inferRequiredSections(job) {
    const text = `${job.title ?? ""}\n${job.details ?? ""}\n${JSON.stringify(job.rawSpec ?? {})}`;
  
    if (/contract 1|contract 2|how they interact|analogy/i.test(text)) {
      return [
        "What Contract 1 Does",
        "What Contract 2 Does",
        "How They Work Together",
        "Simple Analogy",
        "Conclusion"
      ];
    }
  
    if (job.category === "development") {
      return [
        "Overview",
        "Architecture",
        "Implementation Steps",
        "Risks and Tradeoffs",
        "Conclusion"
      ];
    }
  
    if (job.category === "analysis" || job.category === "research") {
      return [
        "Overview",
        "Key Findings",
        "Detailed Analysis",
        "Implications",
        "Conclusion"
      ];
    }
  
    if (job.category === "creative") {
      return [
        "Overview",
        "Main Content",
        "Conclusion"
      ];
    }
  
    return [
      "Overview",
      "Details",
      "Conclusion"
    ];
  }
  
  export function buildBrief(job) {
    return {
      jobId: Number(job.jobId),
      title: job.title || `Job ${job.jobId}`,
      goal: job.details || "",
      category: job.category || "other",
      audience: inferAudience(job),
      tone: inferTone(job),
      constraints: inferConstraints(job),
      required_sections: inferRequiredSections(job),
      context: {
        payout: job.payout ?? null,
        durationSeconds: job.durationSeconds ?? null,
        specUri: job.specUri ?? null
      }
    };
  }
export function buildBriefWithLane(job, lane = 'job-v1') {
  const brief = buildBrief(job)
  return {
    ...brief,
    lane,
    deterministicBoundary: 'external-agent-candidate-only'
  }
}
