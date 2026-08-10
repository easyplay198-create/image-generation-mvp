import {
  parseDesignDocument,
  type DesignDocument,
} from "@/src/editor/design-document";

const DEFAULT_HISTORY_LIMIT = 50;

export class DesignHistory {
  private past: DesignDocument[] = [];
  private present: DesignDocument;
  private future: DesignDocument[] = [];

  constructor(
    initialDocument: DesignDocument,
    private readonly limit = DEFAULT_HISTORY_LIMIT,
  ) {
    this.present = cloneDocument(initialDocument);
  }

  get current(): DesignDocument {
    return cloneDocument(this.present);
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  push(nextDocument: DesignDocument): DesignDocument {
    const next = cloneDocument(nextDocument);
    if (sameDocument(this.present, next)) return this.current;

    this.past.push(this.present);
    if (this.past.length > this.limit) this.past.shift();
    this.present = next;
    this.future = [];
    return this.current;
  }

  undo(): DesignDocument {
    const previous = this.past.pop();
    if (!previous) return this.current;

    this.future.unshift(this.present);
    this.present = previous;
    return this.current;
  }

  redo(): DesignDocument {
    const next = this.future.shift();
    if (!next) return this.current;

    this.past.push(this.present);
    this.present = next;
    return this.current;
  }
}

function cloneDocument(document: DesignDocument): DesignDocument {
  return parseDesignDocument(structuredClone(document));
}

function sameDocument(left: DesignDocument, right: DesignDocument): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
