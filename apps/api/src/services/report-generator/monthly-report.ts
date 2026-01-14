/**
 * Monthly Report Generator
 * Generates comprehensive monthly governance reports
 */

import { format } from 'date-fns';
import type { ReportMetrics } from './data-collector';
import { llmService } from '../llm';

export interface MonthlyReportResult {
  title: string;
  summary: string;
  content: string;
  generatedAt: string;
}

export class MonthlyReportGenerator {
  /**
   * Generate a monthly governance report in markdown format
   */
  async generate(metrics: ReportMetrics): Promise<MonthlyReportResult> {
    const startDate = new Date(metrics.period.start);
    const monthName = format(startDate, 'MMMM yyyy');

    const title = `Monthly Governance Report - ${monthName}`;

    // Generate executive summary using LLM
    const executiveSummary = await this.generateExecutiveSummary(metrics);

    // Generate strategic insights using LLM
    const strategicInsights = await this.generateStrategicInsights(metrics);

    // Build the full markdown content
    const content = this.buildMarkdownContent(metrics, executiveSummary, strategicInsights, startDate);

    // Create a brief summary
    const summary = this.createSummary(metrics, executiveSummary);

    return {
      title,
      summary,
      content,
      generatedAt: new Date().toISOString(),
    };
  }

  private async generateExecutiveSummary(metrics: ReportMetrics): Promise<string> {
    const prompt = `You are a senior governance analyst for a DAO (Decentralized Autonomous Organization).
Write a comprehensive executive summary (3-4 paragraphs) for this monthly governance report.

Monthly Metrics:
- Total signals: ${metrics.signals.total}
- Issues: ${metrics.issues.detected} detected, ${metrics.issues.resolved} resolved (${metrics.issues.resolutionRate.toFixed(1)}% resolution)
- Proposals: ${metrics.proposals.total} total, ${metrics.proposals.passed} passed, ${metrics.proposals.rejected} rejected
- Pass rate: ${metrics.proposals.passRate.toFixed(1)}%
- Agent activity: ${metrics.agents.active} active agents, ${metrics.agents.totalMessages} total messages
- Trust score average: ${(metrics.agents.avgTrustScore * 100).toFixed(1)}%
- Agora sessions: ${metrics.sessions.total} sessions, ${metrics.sessions.avgConsensus.toFixed(1)}% average consensus
- LLM operations: ${metrics.system.llmCalls} calls, $${metrics.system.llmCost.toFixed(2)} cost

Write in a professional, analytical tone. Cover:
1. Overall governance health
2. Key achievements and concerns
3. Operational efficiency
4. Recommendations for next month`;

    try {
      const result = await llmService.generate({
        prompt,
        tier: 1,
        maxTokens: 800,
        temperature: 0.7,
        complexity: 'balanced',
      });
      return result.content;
    } catch (error) {
      return this.generateFallbackSummary(metrics);
    }
  }

  private generateFallbackSummary(metrics: ReportMetrics): string {
    return `This monthly report covers the governance activities for the Algora platform. During this period, the system processed ${metrics.signals.total} signals from various sources, demonstrating continuous monitoring of the ecosystem.

Issue management showed ${metrics.issues.detected} new issues detected with ${metrics.issues.resolved} successfully resolved, achieving a ${metrics.issues.resolutionRate.toFixed(1)}% resolution rate. The average resolution time indicates the team's responsiveness to emerging concerns.

Governance participation remained healthy with ${metrics.proposals.total} proposals submitted. Of these, ${metrics.proposals.passed} were approved and ${metrics.proposals.rejected} were rejected, resulting in a ${metrics.proposals.passRate.toFixed(1)}% pass rate. The agent network maintained strong engagement with ${metrics.agents.active} active agents contributing ${metrics.agents.totalMessages} messages across ${metrics.sessions.total} deliberation sessions.

System operations were efficient with ${metrics.system.llmCalls} LLM operations processed at a total cost of $${metrics.system.llmCost.toFixed(2)}, demonstrating cost-effective AI utilization for governance tasks.`;
  }

  private async generateStrategicInsights(metrics: ReportMetrics): Promise<string[]> {
    const insights: string[] = [];

    // Issue management insight
    if (metrics.issues.resolutionRate >= 80) {
      insights.push('Issue resolution efficiency is excellent, indicating a well-functioning incident response process.');
    } else if (metrics.issues.resolutionRate < 50) {
      insights.push('Issue resolution rate is below target. Consider allocating more resources to issue triage and resolution.');
    }

    // Governance health
    if (metrics.proposals.passRate >= 60 && metrics.proposals.passRate <= 80) {
      insights.push('Proposal pass rate indicates healthy governance dynamics with meaningful deliberation.');
    } else if (metrics.proposals.passRate > 90) {
      insights.push('Very high pass rate may indicate need for more diverse perspectives in proposal review.');
    } else if (metrics.proposals.passRate < 40) {
      insights.push('Low pass rate suggests proposals may need better alignment with community values before submission.');
    }

    // Agent engagement
    const engagementRate = metrics.agents.active / metrics.agents.total;
    if (engagementRate >= 0.8) {
      insights.push('Agent engagement is strong across the network, supporting robust multi-perspective governance.');
    } else if (engagementRate < 0.5) {
      insights.push('Agent participation could be improved. Consider reviewing agent activation mechanisms.');
    }

    // Consensus quality
    if (metrics.sessions.avgConsensus >= 75) {
      insights.push('High consensus levels indicate effective deliberation and alignment on key decisions.');
    } else if (metrics.sessions.avgConsensus < 50) {
      insights.push('Lower consensus levels may indicate contentious topics requiring additional discussion rounds.');
    }

    // Cost efficiency
    if (metrics.system.llmCost > 0 && metrics.system.llmCalls > 0) {
      const costPerCall = metrics.system.llmCost / metrics.system.llmCalls;
      if (costPerCall < 0.01) {
        insights.push('LLM operations are highly cost-efficient, leveraging local models effectively.');
      }
    }

    return insights.length > 0 ? insights : ['Governance operations are proceeding within normal parameters.'];
  }

  private buildMarkdownContent(
    metrics: ReportMetrics,
    executiveSummary: string,
    strategicInsights: string[],
    startDate: Date
  ): string {
    const formatNum = (n: number) => n.toLocaleString();
    const formatPct = (n: number) => `${n.toFixed(1)}%`;
    const monthName = format(startDate, 'MMMM yyyy');

    return `# Monthly Governance Report

## ${monthName}

**Generated:** ${format(new Date(), 'MMMM d, yyyy HH:mm')} UTC

---

## Executive Summary

${executiveSummary}

---

## Strategic Insights

${strategicInsights.map((insight, i) => `${i + 1}. ${insight}`).join('\n\n')}

---

## Monthly Statistics at a Glance

| Category | Metric | Value |
|----------|--------|-------|
| **Signals** | Total Collected | ${formatNum(metrics.signals.total)} |
| | Trend vs Previous | ${metrics.signals.trend >= 0 ? '📈' : '📉'} ${formatPct(Math.abs(metrics.signals.trend))} |
| **Issues** | Detected | ${formatNum(metrics.issues.detected)} |
| | Resolved | ${formatNum(metrics.issues.resolved)} |
| | Resolution Rate | ${formatPct(metrics.issues.resolutionRate)} |
| **Proposals** | Total | ${formatNum(metrics.proposals.total)} |
| | Pass Rate | ${formatPct(metrics.proposals.passRate)} |
| | Total Votes Cast | ${formatNum(metrics.proposals.totalVotes)} |
| **Agents** | Active | ${formatNum(metrics.agents.active)} / ${formatNum(metrics.agents.total)} |
| | Messages | ${formatNum(metrics.agents.totalMessages)} |
| | Avg Trust Score | ${formatPct(metrics.agents.avgTrustScore * 100)} |
| **Sessions** | Total | ${formatNum(metrics.sessions.total)} |
| | Avg Consensus | ${formatPct(metrics.sessions.avgConsensus)} |
| **System** | LLM Calls | ${formatNum(metrics.system.llmCalls)} |
| | LLM Cost | $${metrics.system.llmCost.toFixed(2)} |

---

## Detailed Analysis

### Signal Intelligence

This month's signal collection demonstrates the breadth of our monitoring capabilities.

#### Distribution by Source
| Source | Count | Percentage |
|--------|-------|------------|
${Object.entries(metrics.signals.bySource)
  .sort((a, b) => b[1] - a[1])
  .map(([source, count]) => {
    const pct = metrics.signals.total > 0 ? (count / metrics.signals.total) * 100 : 0;
    return `| ${source} | ${formatNum(count)} | ${formatPct(pct)} |`;
  })
  .join('\n')}

#### Severity Distribution
| Severity | Count | Indicator |
|----------|-------|-----------|
${Object.entries(metrics.signals.bySeverity)
  .sort((a, b) => {
    const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    return (order[a[0]] ?? 5) - (order[b[0]] ?? 5);
  })
  .map(([severity, count]) => `| ${this.getSeverityIndicator(severity)} ${severity.charAt(0).toUpperCase() + severity.slice(1)} | ${formatNum(count)} | ${this.getSeverityBar(count, metrics.signals.total)} |`)
  .join('\n')}

---

### Issue Management Performance

${metrics.issues.avgResolutionTime > 0
  ? `**Average Resolution Time:** ${metrics.issues.avgResolutionTime.toFixed(1)} hours`
  : ''}

#### Issues by Priority
| Priority | Count | Status |
|----------|-------|--------|
${Object.entries(metrics.issues.byPriority)
  .sort((a, b) => {
    const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    return (order[a[0]] ?? 5) - (order[b[0]] ?? 5);
  })
  .map(([priority, count]) => `| ${this.getPriorityIndicator(priority)} ${priority.charAt(0).toUpperCase() + priority.slice(1)} | ${formatNum(count)} | ${this.getProgressBar(count, metrics.issues.detected)} |`)
  .join('\n')}

#### Resolution Metrics
- **Resolution Rate:** ${formatPct(metrics.issues.resolutionRate)} ${this.getRatingEmoji(metrics.issues.resolutionRate)}
- **Open Issues:** ${formatNum(metrics.issues.inProgress)}

---

### Governance Proposals

#### Proposal Outcomes
| Status | Count | Percentage |
|--------|-------|------------|
| ✅ Passed | ${formatNum(metrics.proposals.passed)} | ${formatPct(metrics.proposals.total > 0 ? (metrics.proposals.passed / metrics.proposals.total) * 100 : 0)} |
| ❌ Rejected | ${formatNum(metrics.proposals.rejected)} | ${formatPct(metrics.proposals.total > 0 ? (metrics.proposals.rejected / metrics.proposals.total) * 100 : 0)} |
| ⏳ Pending | ${formatNum(metrics.proposals.pending)} | - |

#### Participation Metrics
- **Total Votes Cast:** ${formatNum(metrics.proposals.totalVotes)}
- **Average Votes per Proposal:** ${metrics.proposals.avgParticipation.toFixed(1)}

${metrics.proposals.recentProposals.length > 0 ? `#### Notable Proposals
| Title | Outcome | Votes For | Votes Against |
|-------|---------|-----------|---------------|
${metrics.proposals.recentProposals.map(p => `| ${this.truncateText(p.title, 35)} | ${this.getStatusEmoji(p.status)} | ${formatNum(p.votes_for)} | ${formatNum(p.votes_against)} |`).join('\n')}` : ''}

---

### Agent Network Performance

#### Engagement Overview
- **Network Size:** ${formatNum(metrics.agents.total)} agents
- **Active This Month:** ${formatNum(metrics.agents.active)} (${formatPct((metrics.agents.active / metrics.agents.total) * 100)})
- **Total Contributions:** ${formatNum(metrics.agents.totalMessages)} messages

#### Top Performing Agents
| Rank | Agent | Messages | Trust Score |
|------|-------|----------|-------------|
${metrics.agents.topAgents.map((a, i) => `| ${i + 1} | ${a.name} | ${formatNum(a.messages)} | ${formatPct(a.trust_score * 100)} |`).join('\n')}

#### Agent Group Distribution
| Group | Agents | Role |
|-------|--------|------|
${Object.entries(metrics.agents.byGroup)
  .sort((a, b) => b[1] - a[1])
  .map(([group, count]) => `| ${group} | ${formatNum(count)} | ${this.getGroupDescription(group)} |`)
  .join('\n')}

---

### Agora Deliberation Sessions

#### Session Statistics
| Metric | Value |
|--------|-------|
| Total Sessions | ${formatNum(metrics.sessions.total)} |
| Completed | ${formatNum(metrics.sessions.completed)} |
| In Progress | ${formatNum(metrics.sessions.inProgress)} |
| Average Rounds | ${metrics.sessions.avgRounds.toFixed(1)} |
| Average Participants | ${metrics.sessions.avgParticipants.toFixed(1)} agents |

#### Consensus Quality
**Average Consensus Level:** ${formatPct(metrics.sessions.avgConsensus)} ${this.getRatingEmoji(metrics.sessions.avgConsensus)}

${metrics.sessions.recentSessions.length > 0 ? `#### Recent Sessions
| Topic | Status | Consensus |
|-------|--------|-----------|
${metrics.sessions.recentSessions.map(s => `| ${this.truncateText(s.topic, 35)} | ${this.getStatusEmoji(s.status)} | ${formatPct(s.consensus_level)} |`).join('\n')}` : ''}

---

### Operational Efficiency

#### System Performance
| Metric | Value | Status |
|--------|-------|--------|
| Platform Uptime | ${formatPct(metrics.system.uptime)} | ${metrics.system.uptime >= 99 ? '✅ Excellent' : metrics.system.uptime >= 95 ? '🟡 Good' : '🔴 Needs Attention'} |

#### AI Operations Cost Analysis
| Metric | Value |
|--------|-------|
| Total LLM Calls | ${formatNum(metrics.system.llmCalls)} |
| Total Cost | $${metrics.system.llmCost.toFixed(2)} |
| Cost per Operation | $${metrics.system.llmCalls > 0 ? (metrics.system.llmCost / metrics.system.llmCalls).toFixed(4) : '0.00'} |

---

## Appendix

### Methodology
This report aggregates data from the Algora governance platform's operational databases. Metrics are calculated based on actual system activity during the reporting period.

### Data Sources
- Signal Collection System (Reality Oracle)
- Issue Detection Engine (Inference Mining)
- Agent Consensus Network (Agentic Consensus)
- Proposal Management System (Human Governance)
- System Analytics Database

---

*This report was automatically generated by the Algora Governance Platform's Report Generator.*
*For questions or feedback, contact the governance team.*
`;
  }

  private createSummary(metrics: ReportMetrics, executiveSummary: string): string {
    const firstParagraph = executiveSummary.split('\n\n')[0];
    if (firstParagraph.length <= 300) {
      return firstParagraph;
    }
    return firstParagraph.substring(0, 297) + '...';
  }

  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }

  private getSeverityIndicator(severity: string): string {
    const indicators: Record<string, string> = {
      critical: '🔴',
      high: '🟠',
      medium: '🟡',
      low: '🟢',
      info: '🔵',
    };
    return indicators[severity] || '⚪';
  }

  private getPriorityIndicator(priority: string): string {
    return this.getSeverityIndicator(priority);
  }

  private getSeverityBar(count: number, total: number): string {
    if (total === 0) return '░░░░░░░░░░';
    const pct = (count / total) * 100;
    const filled = Math.round(pct / 10);
    return '█'.repeat(filled) + '░'.repeat(10 - filled);
  }

  private getProgressBar(count: number, total: number): string {
    return this.getSeverityBar(count, total);
  }

  private getStatusEmoji(status: string): string {
    const emojis: Record<string, string> = {
      passed: '✅',
      rejected: '❌',
      pending: '⏳',
      active: '🔵',
      completed: '✅',
      in_progress: '🔄',
    };
    return emojis[status] || '⚪';
  }

  private getRatingEmoji(value: number): string {
    if (value >= 80) return '🌟';
    if (value >= 60) return '✅';
    if (value >= 40) return '🟡';
    return '⚠️';
  }

  private getGroupDescription(group: string): string {
    const descriptions: Record<string, string> = {
      visionaries: 'Strategic Planning',
      builders: 'Technical Development',
      investors: 'Financial Analysis',
      guardians: 'Risk Management',
      operatives: 'Data Collection',
      moderators: 'Discussion Facilitation',
      advisors: 'Domain Expertise',
      orchestrators: 'Workflow Coordination',
      archivists: 'Documentation',
      'red-team': 'Critical Analysis',
      scouts: 'Opportunity Detection',
    };
    return descriptions[group] || 'General Support';
  }
}
