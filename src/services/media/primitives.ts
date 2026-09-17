/**
 * ClipForge v2 Media Primitives
 *
 * NOTE: Fabricated testsrc2 procedural footage generators have been permanently removed
 * in accordance with the ClipForge v2 strict zero-fabricated-content mandate.
 * If real footage cannot be sourced, the pipeline re-plans or fails loudly.
 */

export class EditingPrimitives {
  /**
   * Strictly disallows artificial testsrc2 placeholder footage.
   */
  static rejectProceduralFabrication(shotId: string, topic: string): never {
    throw new Error(
      `ClipForge Zero-Fabrication Violation: Real stock footage could not be sourced for shot "${shotId}" on topic "${topic}". ` +
      `Procedural testsrc2 placeholder fallbacks are permanently forbidden in v2.`
    );
  }
}
