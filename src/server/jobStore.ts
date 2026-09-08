import fs from 'fs/promises';
import path from 'path';
import { JobRecord } from '../types/pipeline.js';
import { config } from './config.js';

class JobStore {
  private inMemoryJobs: Map<string, JobRecord> = new Map();

  public async getJob(jobId: string): Promise<JobRecord | null> {
    const memoryJob = this.inMemoryJobs.get(jobId);
    if (memoryJob) return memoryJob;

    const jobMetaPath = path.join(config.jobsDir, jobId, 'job.json');
    try {
      const content = await fs.readFile(jobMetaPath, 'utf-8');
      const record = JSON.parse(content) as JobRecord;
      this.inMemoryJobs.set(jobId, record);
      return record;
    } catch {
      return null;
    }
  }

  public async saveJob(record: JobRecord): Promise<void> {
    this.inMemoryJobs.set(record.jobId, record);

    const jobDir = path.join(config.jobsDir, record.jobId);
    const jobMetaPath = path.join(jobDir, 'job.json');

    try {
      await fs.mkdir(jobDir, { recursive: true });
      await fs.writeFile(jobMetaPath, JSON.stringify(record, null, 2), 'utf-8');
    } catch (err) {
      console.error(`Failed to persist job record for ${record.jobId}:`, err);
    }
  }

  public async listJobs(): Promise<JobRecord[]> {
    const jobs: JobRecord[] = Array.from(this.inMemoryJobs.values());

    try {
      await fs.mkdir(config.jobsDir, { recursive: true });
      const entries = await fs.readdir(config.jobsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory() && !this.inMemoryJobs.has(entry.name)) {
          const loaded = await this.getJob(entry.name);
          if (loaded) jobs.push(loaded);
        }
      }
    } catch {
      // Ignore directory read errors
    }

    // Sort newest first
    return jobs.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }
}

export const jobStore = new JobStore();
