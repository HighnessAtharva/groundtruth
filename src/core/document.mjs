// The Document model. One parse, one line index, handed to every module.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { splitFrontmatter } from './frontmatter.mjs';
import { parseMarkdown } from './markdown.mjs';
import { makeQuery } from './views.mjs';
import { sha256 } from './hash.mjs';

export class Document {
  constructor({ absolutePath, relativePath, source, profile = null, profileName = null }) {
    this.absolutePath = absolutePath;
    this.path = relativePath.replace(/\\/g, '/');
    this.id = docId(this.path);
    this.source = source;
    this.contentHash = sha256(source);
    this.profile = profile;
    this.profileName = profileName;

    const { data, body, bodyLine, errors } = splitFrontmatter(source);
    this.frontmatter = data;
    this.frontmatterErrors = errors;
    this.body = body;
    this.bodyLine = bodyLine;
    this.bodyOffset = source.length - body.length;

    const { blocks, definitions } = parseMarkdown(body, {
      startLine: bodyLine,
      startOffset: this.bodyOffset,
    });
    this.blocks = blocks;
    this.definitions = definitions;

    this.query = makeQuery(blocks, {
      waiveQuotations: profile?.readability?.waiveQuotations ?? true,
      waiveCallouts: profile?.readability?.waiveCallouts ?? false,
    });

    this.lineStarts = buildLineStarts(source);
  }

  /** 1-based line for an absolute character offset into the source file. */
  lineAt(offset) {
    const target = Math.max(0, Math.min(offset, this.source.length));
    let low = 0;
    let high = this.lineStarts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (this.lineStarts[mid] <= target) low = mid;
      else high = mid - 1;
    }
    return low + 1;
  }

  /** 1-based column for an absolute character offset. */
  columnAt(offset) {
    const line = this.lineAt(offset);
    return offset - this.lineStarts[line - 1] + 1;
  }

  lineText(line) {
    const start = this.lineStarts[line - 1];
    if (start == null) return '';
    const end = this.lineStarts[line] ?? this.source.length + 1;
    return this.source.slice(start, end - 1).replace(/\r$/, '');
  }

  get dir() {
    return path.posix.dirname(this.path);
  }

  get name() {
    return path.posix.basename(this.path, path.posix.extname(this.path));
  }

  get slug() {
    return String(this.frontmatter.slug || this.name);
  }
}

export function loadDocument(absolutePath, relativePath, options = {}) {
  const source = readFileSync(absolutePath, 'utf8');
  return new Document({ absolutePath, relativePath, source, ...options });
}

/** Stable id: path minus extension, slashes to dashes. Used to name span maps. */
export function docId(relativePath) {
  return relativePath
    .replace(/\\/g, '/')
    .replace(/\.[^./]+$/, '')
    .replace(/^\.\//, '')
    .replace(/\//g, '-');
}

function buildLineStarts(source) {
  const starts = [0];
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] === '\n') starts.push(i + 1);
  }
  return starts;
}

/** Expand `${docId}`, `${dir}`, `${name}`, `${slug}` in a path template. */
export function expandTemplate(template, doc) {
  return String(template).replace(/\$\{(\w+)\}/g, (whole, key) => {
    switch (key) {
      case 'docId': return doc.id;
      case 'dir': return doc.dir === '.' ? '' : doc.dir;
      case 'name': return doc.name;
      case 'slug': return doc.slug;
      case 'path': return doc.path;
      default: return whole;
    }
  });
}
