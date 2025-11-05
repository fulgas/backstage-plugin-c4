import { CharStream, CommonTokenStream } from 'antlr4ng';
import { StructurizrDSLLexer } from '../grammar/generated/StructurizrDSLLexer';
import {
  StructurizrDSLParser,
  WorkspaceContext,
  ModelBlockContext,
  ViewsBlockContext,
  AssignmentContext,
  PersonDeclContext,
  SoftwareSystemDeclContext,
  ContainerDeclContext,
  RelationshipContext,
  SystemContextViewContext,
  ContainerViewContext,
  StatementContext,
} from '../grammar/generated/StructurizrDSLParser';

export interface ParsedPerson { varName: string; name: string; description: string; }
export interface ParsedContainer { varName: string; name: string; description: string; technology: string; }
export interface ParsedSystem { varName: string; name: string; description: string; containers: ParsedContainer[]; }
export interface ParsedRelationship { sourceVar: string; targetVar: string; description: string; }
export interface ParsedView { type: 'context' | 'container'; subjectVar: string; key: string; title: string; }
export interface ParsedLandscapeView { key: string; title: string; }
export interface ParsedWorkspace {
  persons: ParsedPerson[];
  systems: ParsedSystem[];
  relationships: ParsedRelationship[];
  contextViews: ParsedView[];
  containerViews: ParsedView[];
  landscapeViews: ParsedLandscapeView[];
}

export class StructurizrParser {
  parse(dsl: string): ParsedWorkspace {
    const result: ParsedWorkspace = {
      persons: [],
      systems: [],
      relationships: [],
      contextViews: [],
      containerViews: [],
      landscapeViews: [],
    };
    // Extract systemLandscape views via regex (grammar doesn't support them)
    for (const m of dsl.matchAll(/systemLandscape\s+"([^"]+)"\s*\{[^}]*title\s+"([^"]+)"/g)) {
      result.landscapeViews.push({ key: m[1], title: m[2] });
    }
    // Also handle systemLandscape without title
    for (const m of dsl.matchAll(/systemLandscape\s+"([^"]+)"\s*\{(?![^}]*title)/g)) {
      if (!result.landscapeViews.find(v => v.key === m[1])) {
        result.landscapeViews.push({ key: m[1], title: m[1] });
      }
    }
    try {
      const inputStream = CharStream.fromString(dsl);
      const lexer = new StructurizrDSLLexer(inputStream);
      const tokenStream = new CommonTokenStream(lexer);
      const parser = new StructurizrDSLParser(tokenStream);
      parser.removeErrorListeners();
      const tree: WorkspaceContext = parser.workspace();
      this.visitWorkspace(tree, result);
    } catch { /* return empty on error */ }
    return result;
  }

  private visitWorkspace(ctx: WorkspaceContext, result: ParsedWorkspace): void {
    const block = ctx.block();
    for (const stmt of block.statement()) {
      this.visitTopLevelStatement(stmt, result);
    }
  }

  private visitTopLevelStatement(stmt: StatementContext, result: ParsedWorkspace): void {
    const modelBlock = stmt.modelBlock();
    if (modelBlock) {
      this.visitModelBlock(modelBlock, result);
      return;
    }
    const viewsBlock = stmt.viewsBlock();
    if (viewsBlock) {
      this.visitViewsBlock(viewsBlock, result);
    }
  }

  private visitModelBlock(ctx: ModelBlockContext, result: ParsedWorkspace): void {
    for (const stmt of ctx.block().statement()) {
      const assignment = stmt.assignment();
      if (assignment) {
        this.visitAssignment(assignment, result);
        continue;
      }
      const rel = stmt.relationship();
      if (rel) {
        result.relationships.push(this.extractRelationship(rel));
      }
    }
  }

  private visitAssignment(ctx: AssignmentContext, result: ParsedWorkspace): void {
    const varName = ctx.IDENTIFIER().getText();
    const elementDecl = ctx.elementDecl();
    const personDecl = elementDecl.personDecl();
    if (personDecl) {
      result.persons.push(this.extractPerson(varName, personDecl));
      return;
    }
    const systemDecl = elementDecl.softwareSystemDecl();
    if (systemDecl) {
      result.systems.push(this.extractSystem(varName, systemDecl));
    }
  }

  private extractPerson(varName: string, ctx: PersonDeclContext): ParsedPerson {
    const strings = ctx.STRING();
    const name = unquote(strings[0]?.getText() ?? '');
    const description = unquote(strings[1]?.getText() ?? '');
    return { varName, name, description };
  }

  private extractSystem(varName: string, ctx: SoftwareSystemDeclContext): ParsedSystem {
    const strings = ctx.STRING();
    const name = unquote(strings[0]?.getText() ?? '');
    const description = unquote(strings[1]?.getText() ?? '');
    const containers: ParsedContainer[] = [];
    for (const containerStmt of ctx.containerStatement()) {
      const containerDecl = containerStmt.containerDecl();
      if (containerDecl) {
        containers.push(this.extractContainer(containerDecl));
      }
    }
    return { varName, name, description, containers };
  }

  private extractContainer(ctx: ContainerDeclContext): ParsedContainer {
    const varName = ctx.IDENTIFIER().getText();
    const strings = ctx.STRING();
    const name = unquote(strings[0]?.getText() ?? '');
    const description = unquote(strings[1]?.getText() ?? '');
    const technology = unquote(strings[2]?.getText() ?? '');
    return { varName, name, description, technology };
  }

  private extractRelationship(ctx: RelationshipContext): ParsedRelationship {
    const identifiers = ctx.IDENTIFIER();
    const sourceVar = identifiers[0]?.getText() ?? '';
    const targetVar = identifiers[1]?.getText() ?? '';
    const strings = ctx.STRING();
    const description = unquote(strings[0]?.getText() ?? '');
    return { sourceVar, targetVar, description };
  }

  private visitViewsBlock(ctx: ViewsBlockContext, result: ParsedWorkspace): void {
    for (const stmt of ctx.block().statement()) {
      const viewDecl = stmt.viewDecl();
      if (!viewDecl) continue;
      const sysCtxView = viewDecl.systemContextView();
      if (sysCtxView) {
        result.contextViews.push(this.extractContextView(sysCtxView));
        continue;
      }
      const containerView = viewDecl.containerView();
      if (containerView) {
        result.containerViews.push(this.extractContainerView(containerView));
      }
    }
  }

  private extractContextView(ctx: SystemContextViewContext): ParsedView {
    const subjectVar = ctx.IDENTIFIER().getText();
    const key = unquote(ctx.STRING()?.getText() ?? '');
    return { type: 'context', subjectVar, key, title: key };
  }

  private extractContainerView(ctx: ContainerViewContext): ParsedView {
    const subjectVar = ctx.IDENTIFIER().getText();
    const key = unquote(ctx.STRING()?.getText() ?? '');
    return { type: 'container', subjectVar, key, title: key };
  }
}

function unquote(s: string): string {
  return s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s;
}
