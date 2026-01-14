import { Router } from 'express';
import type { DisclosureService } from '../services/disclosure';
import type { ReportGeneratorService } from '../services/report-generator';

export const disclosureRouter: Router = Router();

// GET /api/disclosure - List disclosure reports
disclosureRouter.get('/', (req, res) => {
  const disclosure: DisclosureService = req.app.locals.disclosure;
  const { type, status, limit = '50', offset = '0' } = req.query;

  try {
    const reports = disclosure.getAll({
      type: type as any,
      status: status as any,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });

    res.json({ reports });
  } catch (error) {
    console.error('Failed to fetch disclosure reports:', error);
    res.status(500).json({ error: 'Failed to fetch disclosure reports' });
  }
});

// GET /api/disclosure/published - Get published reports
disclosureRouter.get('/published', (req, res) => {
  const disclosure: DisclosureService = req.app.locals.disclosure;
  const { limit = '50' } = req.query;

  try {
    const reports = disclosure.getPublished(parseInt(limit as string));
    res.json({ reports });
  } catch (error) {
    console.error('Failed to fetch published reports:', error);
    res.status(500).json({ error: 'Failed to fetch published reports' });
  }
});

// GET /api/disclosure/stats - Get report statistics
disclosureRouter.get('/stats', (req, res) => {
  const disclosure: DisclosureService = req.app.locals.disclosure;

  try {
    const stats = disclosure.getStats();
    res.json({ stats });
  } catch (error) {
    console.error('Failed to get disclosure stats:', error);
    res.status(500).json({ error: 'Failed to get disclosure stats' });
  }
});

// GET /api/disclosure/metrics/preview - Preview report metrics without generating
// NOTE: This must be before /:id route
disclosureRouter.get('/metrics/preview', (req, res) => {
  const reportGenerator: ReportGeneratorService | undefined = req.app.locals.reportGenerator;
  const { type = 'weekly' } = req.query;

  if (!reportGenerator) {
    res.status(503).json({ error: 'Report generator service not available' });
    return;
  }

  if (type !== 'weekly' && type !== 'monthly') {
    res.status(400).json({ error: 'type must be "weekly" or "monthly"' });
    return;
  }

  try {
    const metrics = reportGenerator.getMetricsPreview(type as 'weekly' | 'monthly');
    res.json({ metrics });
  } catch (error: any) {
    console.error('Failed to get metrics preview:', error);
    res.status(500).json({ error: error.message || 'Failed to get metrics preview' });
  }
});

// POST /api/disclosure/generate/weekly - Generate weekly report manually
// NOTE: This must be before /:id route
disclosureRouter.post('/generate/weekly', async (req, res) => {
  const reportGenerator: ReportGeneratorService | undefined = req.app.locals.reportGenerator;
  const { autoPublish = false } = req.body;

  if (!reportGenerator) {
    res.status(503).json({ error: 'Report generator service not available' });
    return;
  }

  try {
    const result = await reportGenerator.generateWeeklyReport(autoPublish);
    res.status(201).json({
      success: true,
      report: result,
      message: `Weekly report generated: ${result.title}`,
    });
  } catch (error: any) {
    console.error('Failed to generate weekly report:', error);
    res.status(500).json({ error: error.message || 'Failed to generate weekly report' });
  }
});

// POST /api/disclosure/generate/monthly - Generate monthly report manually
// NOTE: This must be before /:id route
disclosureRouter.post('/generate/monthly', async (req, res) => {
  const reportGenerator: ReportGeneratorService | undefined = req.app.locals.reportGenerator;
  const { autoPublish = false } = req.body;

  if (!reportGenerator) {
    res.status(503).json({ error: 'Report generator service not available' });
    return;
  }

  try {
    const result = await reportGenerator.generateMonthlyReport(autoPublish);
    res.status(201).json({
      success: true,
      report: result,
      message: `Monthly report generated: ${result.title}`,
    });
  } catch (error: any) {
    console.error('Failed to generate monthly report:', error);
    res.status(500).json({ error: error.message || 'Failed to generate monthly report' });
  }
});

// POST /api/disclosure - Create disclosure report
disclosureRouter.post('/', (req, res) => {
  const disclosure: DisclosureService = req.app.locals.disclosure;
  const { title, type, date, summary, content, fileUrl, author } = req.body;

  if (!title || !type || !date || !summary || !author) {
    res.status(400).json({ error: 'title, type, date, summary, and author are required' });
    return;
  }

  if (!['quarterly', 'annual', 'incident', 'audit'].includes(type)) {
    res.status(400).json({ error: 'type must be "quarterly", "annual", "incident", or "audit"' });
    return;
  }

  try {
    const report = disclosure.create({
      title,
      type,
      date,
      summary,
      content,
      fileUrl,
      author,
    });

    res.status(201).json({ report });
  } catch (error) {
    console.error('Failed to create disclosure report:', error);
    res.status(500).json({ error: 'Failed to create disclosure report' });
  }
});

// GET /api/disclosure/:id - Get single report
// NOTE: This must be after all specific routes like /published, /stats, /generate/*
disclosureRouter.get('/:id', (req, res) => {
  const disclosure: DisclosureService = req.app.locals.disclosure;
  const { id } = req.params;

  try {
    const report = disclosure.getById(id);

    if (!report) {
      res.status(404).json({ error: 'Report not found' });
      return;
    }

    res.json({ report });
  } catch (error) {
    console.error('Failed to fetch disclosure report:', error);
    res.status(500).json({ error: 'Failed to fetch disclosure report' });
  }
});

// PUT /api/disclosure/:id - Update report
disclosureRouter.put('/:id', (req, res) => {
  const disclosure: DisclosureService = req.app.locals.disclosure;
  const { id } = req.params;
  const { title, type, date, summary, content, fileUrl } = req.body;

  try {
    const report = disclosure.update(id, {
      title,
      type,
      date,
      summary,
      content,
      fileUrl,
    });

    res.json({ report });
  } catch (error: any) {
    console.error('Failed to update disclosure report:', error);
    res.status(400).json({ error: error.message || 'Failed to update disclosure report' });
  }
});

// POST /api/disclosure/:id/publish - Publish report
disclosureRouter.post('/:id/publish', (req, res) => {
  const disclosure: DisclosureService = req.app.locals.disclosure;
  const { id } = req.params;

  try {
    const report = disclosure.publish(id);
    res.json({ report });
  } catch (error: any) {
    console.error('Failed to publish disclosure report:', error);
    res.status(400).json({ error: error.message || 'Failed to publish disclosure report' });
  }
});

// POST /api/disclosure/:id/pending - Set report to pending
disclosureRouter.post('/:id/pending', (req, res) => {
  const disclosure: DisclosureService = req.app.locals.disclosure;
  const { id } = req.params;

  try {
    const report = disclosure.setPending(id);
    res.json({ report });
  } catch (error: any) {
    console.error('Failed to set report to pending:', error);
    res.status(400).json({ error: error.message || 'Failed to set report to pending' });
  }
});

// DELETE /api/disclosure/:id - Delete report
disclosureRouter.delete('/:id', (req, res) => {
  const disclosure: DisclosureService = req.app.locals.disclosure;
  const { id } = req.params;

  try {
    disclosure.delete(id);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Failed to delete disclosure report:', error);
    res.status(400).json({ error: error.message || 'Failed to delete disclosure report' });
  }
});
