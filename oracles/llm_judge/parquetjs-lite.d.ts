// oracles/llm_judge/parquetjs-lite.d.ts
//
// Minimal ambient declaration for the parquetjs-lite npm package, which ships
// no TypeScript types. We only use ParquetSchema + ParquetWriter.openFile +
// writer.appendRow + writer.close, so a narrow surface is documented here.

declare module 'parquetjs-lite' {
  // Schema field shape supports a wide variety of options; we only use
  // {type, optional?} so we keep the type permissive.
  export interface ParquetFieldSpec {
    type: string;
    optional?: boolean;
    repeated?: boolean;
    compression?: string;
    encoding?: string;
  }
  export class ParquetSchema {
    constructor(fields: Record<string, ParquetFieldSpec>);
  }
  export class ParquetWriter {
    static openFile(schema: ParquetSchema, path: string): Promise<ParquetWriter>;
    appendRow(row: Record<string, unknown>): Promise<void>;
    close(): Promise<void>;
  }
  // Other exports exist (ParquetReader, ParquetEnvelopeWriter, etc.) but we
  // do not type them here -- consumers can import via `any` if needed.
}
