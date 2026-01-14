/**
 * Report Generator Service
 * Automatically generates governance reports on schedule
 */

import type { Database } from 'better-sqlite3';
import type { Server as SocketServer } from 'socket.io';
import { DataCollector } from './data-collector';
import { WeeklyReportGenerator } from './weekly-report';
import { MonthlyReportGenerator } from './monthly-report';
import { DisclosureService } from '../disclosure';

export class ReportGeneratorService {
  private dataCollector: DataCollector;
  private weeklyGenerator: WeeklyReportGenerator;
  private monthlyGenerator: MonthlyReportGenerator;
  private disclosureService: DisclosureService;

  constructor(
    private db: Database,
    private io: SocketServer
  ) {
    this.dataCollector = new DataCollector(db);
    this.weeklyGenerator = new WeeklyReportGenerator();
    this.monthlyGenerator = new MonthlyReportGenerator();
    this.disclosureService = new DisclosureService(db, io);
  }

  /**
   * Generate and save a weekly report
   */
  async generateWeeklyReport(autoPublish: boolean = false): Promise<{
    id: string;
    title: string;
    success: boolean;
  }> {
    console.info('[ReportGenerator] Generating weekly report...');

    try {
      // Calculate date range (last 7 days)
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);

      // Collect metrics
      const metrics = this.dataCollector.collectMetrics(startDate, endDate, 'weekly');

      // Generate report
      const report = await this.weeklyGenerator.generate(metrics);

      // Save to disclosure reports
      const savedReport = this.disclosureService.create({
        title: report.title,
        type: 'quarterly', // Using quarterly type for weekly reports (closest match)
        date: new Date().toISOString(),
        summary: report.summary,
        content: report.content,
        author: 'Algora Report Generator',
      });

      // Auto-publish if requested
      if (autoPublish) {
        this.disclosureService.publish(savedReport.id);
      }

      console.info(`[ReportGenerator] Weekly report generated: ${savedReport.id}`);

      // Emit event
      this.io.emit('disclosure:new', {
        type: 'weekly_report',
        reportId: savedReport.id,
        title: report.title,
      });

      return {
        id: savedReport.id,
        title: report.title,
        success: true,
      };
    } catch (error) {
      console.error('[ReportGenerator] Failed to generate weekly report:', error);
      throw error;
    }
  }

  /**
   * Generate and save a monthly report
   */
  async generateMonthlyReport(autoPublish: boolean = false): Promise<{
    id: string;
    title: string;
    success: boolean;
  }> {
    console.info('[ReportGenerator] Generating monthly report...');

    try {
      // Calculate date range (last 30 days)
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);

      // Collect metrics
      const metrics = this.dataCollector.collectMetrics(startDate, endDate, 'monthly');

      // Generate report
      const report = await this.monthlyGenerator.generate(metrics);

      // Save to disclosure reports
      const savedReport = this.disclosureService.create({
        title: report.title,
        type: 'annual', // Using annual type for monthly reports (closest match)
        date: new Date().toISOString(),
        summary: report.summary,
        content: report.content,
        author: 'Algora Report Generator',
      });

      // Auto-publish if requested
      if (autoPublish) {
        this.disclosureService.publish(savedReport.id);
      }

      console.info(`[ReportGenerator] Monthly report generated: ${savedReport.id}`);

      // Emit event
      this.io.emit('disclosure:new', {
        type: 'monthly_report',
        reportId: savedReport.id,
        title: report.title,
      });

      return {
        id: savedReport.id,
        title: report.title,
        success: true,
      };
    } catch (error) {
      console.error('[ReportGenerator] Failed to generate monthly report:', error);
      throw error;
    }
  }

  /**
   * Get preview of report metrics without saving
   */
  getMetricsPreview(type: 'weekly' | 'monthly'): ReturnType<DataCollector['collectMetrics']> {
    const endDate = new Date();
    const startDate = new Date();

    if (type === 'weekly') {
      startDate.setDate(startDate.getDate() - 7);
    } else {
      startDate.setDate(startDate.getDate() - 30);
    }

    return this.dataCollector.collectMetrics(startDate, endDate, type);
  }
}

export { DataCollector } from './data-collector';
export { WeeklyReportGenerator } from './weekly-report';
export { MonthlyReportGenerator } from './monthly-report';
