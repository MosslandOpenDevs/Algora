// ===========================================
// Document Versioning for Algora v2.0
// ===========================================

import type {
  Document,
  DocumentVersion,
  VersionChangeType,
  VersionMetadata,
} from './types.js';
import { formatVersion, compareVersions, incrementVersion } from './types.js';

/**
 * Diff between two document versions.
 */
export interface DocumentDiff {
  documentId: string;
  fromVersion: DocumentVersion;
  toVersion: DocumentVersion;
  changes: DocumentChange[];
  summary: string;
}

/**
 * A single change between versions.
 */
export interface DocumentChange {
  field: string;
  type: 'added' | 'removed' | 'modified';
  oldValue?: string;
  newValue?: string;
}

/**
 * Version branch for tracking document lineage.
 */
export interface VersionBranch {
  documentId: string;
  branchName: string;
  baseVersion: DocumentVersion;
  currentVersion: DocumentVersion;
  createdAt: Date;
  createdBy: string;
  mergedAt?: Date;
  mergedBy?: string;
  mergedIntoVersion?: DocumentVersion;
}

/**
 * Storage for version history.
 */
export interface VersionStorage {
  saveVersion(documentId: string, document: Document, metadata: VersionMetadata): Promise<void>;
  getVersion(documentId: string, version: DocumentVersion): Promise<Document | null>;
  getVersionHistory(documentId: string): Promise<VersionMetadata[]>;
  getAllVersions(documentId: string): Promise<Document[]>;
  getLatestVersion(documentId: string): Promise<Document | null>;
  deleteVersionHistory(documentId: string): Promise<void>;
}

/**
 * In-memory version storage implementation.
 */
export class InMemoryVersionStorage implements VersionStorage {
  private versions: Map<string, Map<string, Document>> = new Map();
  private metadata: Map<string, VersionMetadata[]> = new Map();

  async saveVersion(
    documentId: string,
    document: Document,
    metadata: VersionMetadata
  ): Promise<void> {
    // Get or create version map for this document
    if (!this.versions.has(documentId)) {
      this.versions.set(documentId, new Map());
      this.metadata.set(documentId, []);
    }

    const versionKey = formatVersion(metadata.version);
    this.versions.get(documentId)!.set(versionKey, document);
    this.metadata.get(documentId)!.push(metadata);
  }

  async getVersion(
    documentId: string,
    version: DocumentVersion
  ): Promise<Document | null> {
    const versionMap = this.versions.get(documentId);
    if (!versionMap) return null;

    const versionKey = formatVersion(version);
    return versionMap.get(versionKey) || null;
  }

  async getVersionHistory(documentId: string): Promise<VersionMetadata[]> {
    return this.metadata.get(documentId) || [];
  }

  async getAllVersions(documentId: string): Promise<Document[]> {
    const versionMap = this.versions.get(documentId);
    if (!versionMap) return [];

    return Array.from(versionMap.values()).sort((a, b) =>
      compareVersions(a.version, b.version)
    );
  }

  async getLatestVersion(documentId: string): Promise<Document | null> {
    const versions = await this.getAllVersions(documentId);
    return versions.length > 0 ? versions[versions.length - 1] : null;
  }

  async deleteVersionHistory(documentId: string): Promise<void> {
    this.versions.delete(documentId);
    this.metadata.delete(documentId);
  }
}

/**
 * Version Manager for document versioning.
 */
export class VersionManager {
  private storage: VersionStorage;
  private maxVersions: number;

  constructor(storage?: VersionStorage, maxVersions: number = 100) {
    this.storage = storage || new InMemoryVersionStorage();
    this.maxVersions = maxVersions;
  }

  /**
   * Create a new version of a document.
   */
  async createVersion(
    document: Document,
    changeType: VersionChangeType,
    changeDescription: string,
    createdBy: string
  ): Promise<VersionMetadata> {
    const newVersion = incrementVersion(document.version, changeType);
    const previousVersionId = formatVersion(document.version);

    const metadata: VersionMetadata = {
      version: newVersion,
      createdAt: new Date(),
      createdBy,
      changeType,
      changeDescription,
      previousVersionId,
    };

    // Save the current document as the new version
    const versionedDocument: Document = {
      ...document,
      version: newVersion,
    };

    await this.storage.saveVersion(document.id, versionedDocument, metadata);

    // Enforce max versions
    await this.enforceMaxVersions(document.id);

    return metadata;
  }

  /**
   * Get a specific version of a document.
   */
  async getVersion(
    documentId: string,
    version: DocumentVersion
  ): Promise<Document | null> {
    return this.storage.getVersion(documentId, version);
  }

  /**
   * Get the version history for a document.
   */
  async getHistory(documentId: string): Promise<VersionMetadata[]> {
    const history = await this.storage.getVersionHistory(documentId);
    return history.sort((a, b) => compareVersions(a.version, b.version));
  }

  /**
   * Get all versions of a document.
   */
  async getAllVersions(documentId: string): Promise<Document[]> {
    return this.storage.getAllVersions(documentId);
  }

  /**
   * Get the latest version of a document.
   */
  async getLatest(documentId: string): Promise<Document | null> {
    return this.storage.getLatestVersion(documentId);
  }

  /**
   * Compare two versions and get the diff.
   */
  async diff(
    documentId: string,
    fromVersion: DocumentVersion,
    toVersion: DocumentVersion
  ): Promise<DocumentDiff | null> {
    const fromDoc = await this.getVersion(documentId, fromVersion);
    const toDoc = await this.getVersion(documentId, toVersion);

    if (!fromDoc || !toDoc) return null;

    const changes: DocumentChange[] = [];

    // Compare title
    if (fromDoc.title !== toDoc.title) {
      changes.push({
        field: 'title',
        type: 'modified',
        oldValue: fromDoc.title,
        newValue: toDoc.title,
      });
    }

    // Compare summary
    if (fromDoc.summary !== toDoc.summary) {
      changes.push({
        field: 'summary',
        type: 'modified',
        oldValue: fromDoc.summary,
        newValue: toDoc.summary,
      });
    }

    // Compare content
    if (fromDoc.content !== toDoc.content) {
      changes.push({
        field: 'content',
        type: 'modified',
        oldValue: `[${fromDoc.content.length} chars]`,
        newValue: `[${toDoc.content.length} chars]`,
      });
    }

    // Compare tags
    const addedTags = toDoc.tags.filter((t) => !fromDoc.tags.includes(t));
    const removedTags = fromDoc.tags.filter((t) => !toDoc.tags.includes(t));

    for (const tag of addedTags) {
      changes.push({ field: 'tags', type: 'added', newValue: tag });
    }
    for (const tag of removedTags) {
      changes.push({ field: 'tags', type: 'removed', oldValue: tag });
    }

    // Compare categories
    const addedCategories = toDoc.categories.filter(
      (c) => !fromDoc.categories.includes(c)
    );
    const removedCategories = fromDoc.categories.filter(
      (c) => !toDoc.categories.includes(c)
    );

    for (const cat of addedCategories) {
      changes.push({ field: 'categories', type: 'added', newValue: cat });
    }
    for (const cat of removedCategories) {
      changes.push({ field: 'categories', type: 'removed', oldValue: cat });
    }

    // Generate summary
    const summary = this.generateDiffSummary(changes);

    return {
      documentId,
      fromVersion,
      toVersion,
      changes,
      summary,
    };
  }

  /**
   * Revert a document to a previous version.
   */
  async revert(
    document: Document,
    targetVersion: DocumentVersion,
    revertedBy: string
  ): Promise<{ document: Document; metadata: VersionMetadata } | null> {
    const targetDoc = await this.getVersion(document.id, targetVersion);
    if (!targetDoc) return null;

    // Create a new version with the content from the target version
    const metadata = await this.createVersion(
      {
        ...document,
        title: targetDoc.title,
        summary: targetDoc.summary,
        content: targetDoc.content,
        tags: targetDoc.tags,
        categories: targetDoc.categories,
      },
      'major',
      `Reverted to version ${formatVersion(targetVersion)}`,
      revertedBy
    );

    const revertedDoc = await this.getVersion(document.id, metadata.version);
    if (!revertedDoc) return null;

    return { document: revertedDoc, metadata };
  }

  /**
   * Check if a version exists.
   */
  async hasVersion(
    documentId: string,
    version: DocumentVersion
  ): Promise<boolean> {
    const doc = await this.getVersion(documentId, version);
    return doc !== null;
  }

  /**
   * Get the version count for a document.
   */
  async getVersionCount(documentId: string): Promise<number> {
    const history = await this.getHistory(documentId);
    return history.length;
  }

  /**
   * Delete version history for a document.
   */
  async deleteHistory(documentId: string): Promise<void> {
    await this.storage.deleteVersionHistory(documentId);
  }

  /**
   * Enforce maximum version limit.
   */
  private async enforceMaxVersions(documentId: string): Promise<void> {
    const versions = await this.getAllVersions(documentId);
    if (versions.length <= this.maxVersions) return;

    // Keep the latest maxVersions, remove oldest
    const toRemove = versions.slice(0, versions.length - this.maxVersions);

    // Note: In a real implementation, we would delete these from storage
    // For the in-memory implementation, we'd need to add a delete method
    console.log(
      `Would remove ${toRemove.length} old versions for ${documentId}`
    );
  }

  /**
   * Generate a human-readable diff summary.
   */
  private generateDiffSummary(changes: DocumentChange[]): string {
    if (changes.length === 0) return 'No changes';

    const parts: string[] = [];

    const modifiedFields = changes
      .filter((c) => c.type === 'modified')
      .map((c) => c.field);
    const addedItems = changes.filter((c) => c.type === 'added');
    const removedItems = changes.filter((c) => c.type === 'removed');

    if (modifiedFields.length > 0) {
      parts.push(`Modified: ${modifiedFields.join(', ')}`);
    }

    if (addedItems.length > 0) {
      const addedByField = this.groupByField(addedItems);
      for (const [field, items] of Object.entries(addedByField)) {
        parts.push(`Added ${items.length} ${field}`);
      }
    }

    if (removedItems.length > 0) {
      const removedByField = this.groupByField(removedItems);
      for (const [field, items] of Object.entries(removedByField)) {
        parts.push(`Removed ${items.length} ${field}`);
      }
    }

    return parts.join('; ');
  }

  /**
   * Group changes by field.
   */
  private groupByField(
    changes: DocumentChange[]
  ): Record<string, DocumentChange[]> {
    const grouped: Record<string, DocumentChange[]> = {};
    for (const change of changes) {
      if (!grouped[change.field]) {
        grouped[change.field] = [];
      }
      grouped[change.field].push(change);
    }
    return grouped;
  }
}

/**
 * Create a version tag for a document.
 */
export function createVersionTag(
  documentId: string,
  version: DocumentVersion,
  tagName: string
): string {
  return `${documentId}@${formatVersion(version)}#${tagName}`;
}

/**
 * Parse a version tag.
 */
export function parseVersionTag(tag: string): {
  documentId: string;
  version: string;
  tagName: string;
} | null {
  const match = tag.match(/^(.+)@(\d+\.\d+\.\d+)#(.+)$/);
  if (!match) return null;

  return {
    documentId: match[1],
    version: match[2],
    tagName: match[3],
  };
}
