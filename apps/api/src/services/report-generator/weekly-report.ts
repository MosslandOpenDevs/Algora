/**
 * Weekly Report Generator
 * Generates professional markdown reports from collected metrics
 */

import { format } from 'date-fns';
import type { ReportMetrics } from './data-collector';
import { llmService } from '../llm';

export interface WeeklyReportResult {
  title: string;
  summary: string;
  content: string;
  generatedAt: string;
}

export class WeeklyReportGenerator {
  /**
   * Generate a weekly governance report in markdown format
   */
  async generate(metrics: ReportMetrics): Promise<WeeklyReportResult> {
    const startDate = new Date(metrics.period.start);
    const endDate = new Date(metrics.period.end);
    const weekNumber = this.getWeekNumber(startDate);
    const year = startDate.getFullYear();

    const title = `Weekly Governance Report - Week ${weekNumber}, ${year}`;

    // Generate executive summary using LLM
    const executiveSummary = await this.generateExecutiveSummary(metrics);

    // Generate key highlights using LLM
    const highlights = await this.generateHighlights(metrics);

    // Build the full markdown content
    const content = this.buildMarkdownContent(metrics, executiveSummary, highlights, startDate, endDate);

    // Create a brief summary for the report list
    const summary = this.createSummary(metrics, executiveSummary);

    return {
      title,
      summary,
      content,
      generatedAt: new Date().toISOString(),
    };
  }

  private getWeekNumber(date: Date): number {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  }

  private async generateExecutiveSummary(metrics: ReportMetrics): Promise<string> {
    const prompt = `You are a governance analyst for a DAO (Decentralized Autonomous Organization).
Based on the following weekly metrics, write a concise executive summary (2-3 paragraphs) highlighting the key governance activities and trends.

Metrics Summary:
- Signals collected: ${metrics.signals.total} (${metrics.signals.trend > 0 ? '+' : ''}${metrics.signals.trend.toFixed(1)}% vs last week)
- Issues: ${metrics.issues.detected} detected, ${metrics.issues.resolved} resolved (${metrics.issues.resolutionRate.toFixed(1)}% resolution rate)
- Proposals: ${metrics.proposals.total} total, ${metrics.proposals.passed} passed, ${metrics.proposals.rejected} rejected
- Agent activity: ${metrics.agents.active} active agents, ${metrics.agents.totalMessages} messages
- Agora sessions: ${metrics.sessions.total} sessions, ${metrics.sessions.avgConsensus.toFixed(1)}% avg consensus

Write in a professional, objective tone. Focus on significant changes, achievements, and areas needing attention.`;

    try {
      const result = await llmService.generate({
        prompt,
        tier: 1,
        maxTokens: 500,
        temperature: 0.7,
        complexity: 'fast',
      });
      return result.content;
    } catch (error) {
      // Fallback if LLM is not available
      return this.generateFallbackSummary(metrics);
    }
  }

  private generateFallbackSummary(metrics: ReportMetrics): string {
    const trendDirection = metrics.signals.trend > 0 ? 'increase' : metrics.signals.trend < 0 ? 'decrease' : 'stable level';
    const trendAmount = Math.abs(metrics.signals.trend).toFixed(1);

    return `This week saw ${metrics.signals.total} signals collected across the governance ecosystem, representing a ${trendAmount}% ${trendDirection} compared to the previous period. The signal distribution shows activity primarily in ${Object.keys(metrics.signals.bySource).join(', ')} sources.

Issue tracking shows ${metrics.issues.detected} new issues detected with ${metrics.issues.resolved} resolved, achieving a ${metrics.issues.resolutionRate.toFixed(1)}% resolution rate. ${metrics.issues.inProgress} issues remain in progress.

Governance proposals saw ${metrics.proposals.total} submissions this period, with ${metrics.proposals.passed} passed and ${metrics.proposals.rejected} rejected. Agent participation remained active with ${metrics.agents.active} agents contributing ${metrics.agents.totalMessages} messages across ${metrics.sessions.total} Agora sessions.`;
  }

  private async generateHighlights(metrics: ReportMetrics): Promise<string[]> {
    const highlights: string[] = [];

    // Signal trend highlight
    if (Math.abs(metrics.signals.trend) > 20) {
      const direction = metrics.signals.trend > 0 ? 'increased' : 'decreased';
      highlights.push(`Signal activity ${direction} by ${Math.abs(metrics.signals.trend).toFixed(0)}% compared to last week`);
    }

    // Resolution rate highlight
    if (metrics.issues.resolutionRate >= 80) {
      highlights.push(`Excellent issue resolution rate of ${metrics.issues.resolutionRate.toFixed(0)}%`);
    } else if (metrics.issues.resolutionRate < 50 && metrics.issues.detected > 0) {
      highlights.push(`Issue resolution rate needs attention at ${metrics.issues.resolutionRate.toFixed(0)}%`);
    }

    // Proposal highlight
    if (metrics.proposals.passRate >= 70 && metrics.proposals.total > 0) {
      highlights.push(`Strong proposal pass rate of ${metrics.proposals.passRate.toFixed(0)}%`);
    }

    // Agent activity highlight
    if (metrics.agents.active >= metrics.agents.total * 0.8) {
      highlights.push(`High agent engagement with ${metrics.agents.active} of ${metrics.agents.total} agents active`);
    }

    // Consensus highlight
    if (metrics.sessions.avgConsensus >= 75) {
      highlights.push(`Strong consensus achieved with ${metrics.sessions.avgConsensus.toFixed(0)}% average across sessions`);
    }

    // Top agent highlight
    if (metrics.agents.topAgents.length > 0) {
      const topAgent = metrics.agents.topAgents[0];
      highlights.push(`Top contributor: ${topAgent.name} with ${topAgent.messages} messages`);
    }

    return highlights.length > 0 ? highlights : ['Standard governance activity this period'];
  }

  private buildMarkdownContent(
    metrics: ReportMetrics,
    executiveSummary: string,
    highlights: string[],
    startDate: Date,
    endDate: Date
  ): string {
    const formatNum = (n: number) => n.toLocaleString();
    const formatPct = (n: number) => `${n.toFixed(1)}%`;

    return `# Weekly Governance Report

**Period:** ${format(startDate, 'MMM d, yyyy')} - ${format(endDate, 'MMM d, yyyy')}
**Generated:** ${format(new Date(), 'MMM d, yyyy HH:mm')} UTC

---

## Executive Summary

${executiveSummary}

---

## Key Highlights

${highlights.map(h => `- ${h}`).join('\n')}

---

## Signal Analytics

### Overview
| Metric | Value | Trend |
|--------|-------|-------|
| Total Signals | ${formatNum(metrics.signals.total)} | ${metrics.signals.trend >= 0 ? '📈' : '📉'} ${formatPct(metrics.signals.trend)} |

### By Source
| Source | Count |
|--------|-------|
${Object.entries(metrics.signals.bySource)
  .sort((a, b) => b[1] - a[1])
  .map(([source, count]) => `| ${source} | ${formatNum(count)} |`)
  .join('\n')}

### By Severity
| Severity | Count |
|----------|-------|
${Object.entries(metrics.signals.bySeverity)
  .sort((a, b) => {
    const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    return (order[a[0]] ?? 5) - (order[b[0]] ?? 5);
  })
  .map(([severity, count]) => `| ${this.getSeverityBadge(severity)} ${severity} | ${formatNum(count)} |`)
  .join('\n')}

${metrics.signals.topSignals.length > 0 ? `### Notable Signals
${metrics.signals.topSignals.map(s => `- **${s.title}** (${s.source}, ${this.getSeverityBadge(s.severity)} ${s.severity})`).join('\n')}` : ''}

---

## Issue Tracking

### Summary
| Status | Count |
|--------|-------|
| 🆕 Detected | ${formatNum(metrics.issues.detected)} |
| ✅ Resolved | ${formatNum(metrics.issues.resolved)} |
| 🔄 In Progress | ${formatNum(metrics.issues.inProgress)} |

**Resolution Rate:** ${formatPct(metrics.issues.resolutionRate)}
${metrics.issues.avgResolutionTime > 0 ? `**Avg Resolution Time:** ${metrics.issues.avgResolutionTime.toFixed(1)} hours` : ''}

### By Priority
| Priority | Count |
|----------|-------|
${Object.entries(metrics.issues.byPriority)
  .sort((a, b) => {
    const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    return (order[a[0]] ?? 5) - (order[b[0]] ?? 5);
  })
  .map(([priority, count]) => `| ${this.getPriorityBadge(priority)} ${priority} | ${formatNum(count)} |`)
  .join('\n')}

---

## Governance Activity

### Proposals Overview
| Metric | Value |
|--------|-------|
| Total Proposals | ${formatNum(metrics.proposals.total)} |
| ✅ Passed | ${formatNum(metrics.proposals.passed)} |
| ❌ Rejected | ${formatNum(metrics.proposals.rejected)} |
| ⏳ Pending | ${formatNum(metrics.proposals.pending)} |
| 📊 Pass Rate | ${formatPct(metrics.proposals.passRate)} |
| 🗳️ Total Votes | ${formatNum(metrics.proposals.totalVotes)} |
| 👥 Avg Participation | ${metrics.proposals.avgParticipation.toFixed(1)} votes/proposal |

${metrics.proposals.recentProposals.length > 0 ? `### Recent Proposals
| Title | Status | For | Against |
|-------|--------|-----|---------|
${metrics.proposals.recentProposals.map(p => `| ${p.title.substring(0, 40)}${p.title.length > 40 ? '...' : ''} | ${this.getStatusBadge(p.status)} | ${formatNum(p.votes_for)} | ${formatNum(p.votes_against)} |`).join('\n')}` : ''}

---

## Agent Performance

### Overview
| Metric | Value |
|--------|-------|
| Total Agents | ${formatNum(metrics.agents.total)} |
| Active This Period | ${formatNum(metrics.agents.active)} |
| Total Messages | ${formatNum(metrics.agents.totalMessages)} |
| Avg Trust Score | ${formatPct(metrics.agents.avgTrustScore * 100)} |

### Top Contributors
| Agent | Messages | Trust Score |
|-------|----------|-------------|
${metrics.agents.topAgents.map(a => `| ${a.name} | ${formatNum(a.messages)} | ${formatPct(a.trust_score * 100)} |`).join('\n')}

### Agent Distribution by Group
| Group | Count |
|-------|-------|
${Object.entries(metrics.agents.byGroup)
  .sort((a, b) => b[1] - a[1])
  .map(([group, count]) => `| ${group} | ${formatNum(count)} |`)
  .join('\n')}

---

## Agora Sessions

### Summary
| Metric | Value |
|--------|-------|
| Total Sessions | ${formatNum(metrics.sessions.total)} |
| Completed | ${formatNum(metrics.sessions.completed)} |
| In Progress | ${formatNum(metrics.sessions.inProgress)} |
| Avg Consensus | ${formatPct(metrics.sessions.avgConsensus)} |
| Avg Rounds | ${metrics.sessions.avgRounds.toFixed(1)} |
| Avg Participants | ${metrics.sessions.avgParticipants.toFixed(1)} agents |

${metrics.sessions.recentSessions.length > 0 ? `### Recent Sessions
| Topic | Status | Consensus |
|-------|--------|-----------|
${metrics.sessions.recentSessions.map(s => `| ${s.topic.substring(0, 40)}${s.topic.length > 40 ? '...' : ''} | ${this.getStatusBadge(s.status)} | ${formatPct(s.consensus_level)} |`).join('\n')}` : ''}

---

## System Status

| Metric | Value |
|--------|-------|
| Uptime | ${formatPct(metrics.system.uptime)} |
| LLM API Calls | ${formatNum(metrics.system.llmCalls)} |
| LLM Cost | $${metrics.system.llmCost.toFixed(2)} |

---

*This report was automatically generated by the Algora Governance Platform.*
*Report ID will be assigned upon publication.*
`;
  }

  private createSummary(metrics: ReportMetrics, executiveSummary: string): string {
    // Take first paragraph of executive summary or create a short summary
    const firstParagraph = executiveSummary.split('\n\n')[0];
    if (firstParagraph.length <= 300) {
      return firstParagraph;
    }
    return firstParagraph.substring(0, 297) + '...';
  }

  private getSeverityBadge(severity: string): string {
    const badges: Record<string, string> = {
      critical: '🔴',
      high: '🟠',
      medium: '🟡',
      low: '🟢',
      info: '🔵',
    };
    return badges[severity] || '⚪';
  }

  private getPriorityBadge(priority: string): string {
    const badges: Record<string, string> = {
      critical: '🔴',
      high: '🟠',
      medium: '🟡',
      low: '🟢',
    };
    return badges[priority] || '⚪';
  }

  private getStatusBadge(status: string): string {
    const badges: Record<string, string> = {
      passed: '✅',
      rejected: '❌',
      pending: '⏳',
      active: '🔵',
      voting: '🗳️',
      completed: '✅',
      in_progress: '🔄',
    };
    return badges[status] || '⚪';
  }
}
