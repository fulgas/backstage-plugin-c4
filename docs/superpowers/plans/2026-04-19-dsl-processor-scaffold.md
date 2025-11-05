# C4 DSL Processor — Part 1: Package Scaffold + ANTLR Grammar

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create @fulgas/plugin-c4-structurizr package and ANTLR4 grammar for Structurizr DSL.

**Architecture:** ANTLR4 grammar compiled to TypeScript via antlr4ng-cli. Generated files committed to repo.

**Tech Stack:** antlr4ng v3.0.16, antlr4ng-cli v2.0.0.

**Prerequisite:** None.

---

## Task 1: Scaffold package

- [ ] **Step 1:** Create `plugins/c4-structurizr/package.json` with the following content:

```json
{
  "name": "@fulgas/plugin-c4-structurizr",
  "version": "0.1.0",
  "main": "src/index.ts",
  "scripts": {
    "build": "backstage-cli package build",
    "test": "backstage-cli package test",
    "tsc": "tsc --noEmit",
    "generate": "antlr4ng -Dlanguage=TypeScript -visitor -no-listener -o src/grammar/generated src/grammar/StructurizrDSL.g4"
  },
  "dependencies": {
    "@backstage/backend-plugin-api": "^1.9.0",
    "@backstage/backend-common": "^0.25.3",
    "@backstage/catalog-client": "^1.9.0",
    "@backstage/catalog-model": "^1.7.3",
    "@fulgas/plugin-c4-common": "^0.1.0",
    "antlr4ng": "^3.0.16",
    "uuid": "^10.0.0"
  },
  "devDependencies": {
    "@backstage/cli": "^0.30.0",
    "antlr4ng-cli": "^2.0.0",
    "@types/uuid": "^10.0.0"
  }
}
```

- [ ] **Step 2:** Read `plugins/c4-backend/tsconfig.json` to understand the pattern, then create `plugins/c4-structurizr/tsconfig.json` with matching structure:

```json
{
  "extends": "@backstage/cli/config/tsconfig.json",
  "include": ["src"],
  "exclude": ["node_modules"],
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  }
}
```

- [ ] **Step 3:** Create `plugins/c4-structurizr/src/grammar/StructurizrDSL.g4` with the following grammar:

```antlr
grammar StructurizrDSL;

workspace
    : 'workspace' STRING? STRING? block EOF
    ;

block
    : '{' statement* '}'
    ;

statement
    : modelBlock
    | viewsBlock
    | assignment
    | relationship
    | viewDecl
    ;

modelBlock
    : 'model' block
    ;

viewsBlock
    : 'views' block
    ;

assignment
    : IDENTIFIER '=' elementDecl
    ;

elementDecl
    : personDecl
    | softwareSystemDecl
    ;

personDecl
    : 'person' STRING STRING?
    ;

softwareSystemDecl
    : 'softwareSystem' STRING STRING? ('{' containerStatement* '}')?
    ;

containerStatement
    : containerDecl
    | relationship
    ;

containerDecl
    : IDENTIFIER '=' 'container' STRING STRING? STRING?
    ;

relationship
    : IDENTIFIER '->' IDENTIFIER STRING? STRING?
    ;

viewDecl
    : systemContextView
    | containerView
    ;

systemContextView
    : 'systemContext' IDENTIFIER STRING block?
    ;

containerView
    : 'container' IDENTIFIER STRING block?
    ;

STRING          : '"' (~["\r\n])* '"' ;
IDENTIFIER      : [a-zA-Z_][a-zA-Z0-9_]* ;
WS              : [ \t\r\n]+ -> skip ;
LINE_COMMENT    : '//' ~[\r\n]* -> skip ;
BLOCK_COMMENT   : '/*' .*? '*/' -> skip ;
```

- [ ] **Step 4:** Create `plugins/c4-structurizr/src/index.ts` with the placeholder comment:

```typescript
// exports added in subsequent plan
```

- [ ] **Step 5:** Run `yarn install` from the repo root to register the new workspace package and install its dependencies.

- [ ] **Step 6:** Run `yarn workspace @fulgas/plugin-c4-structurizr generate` to invoke `antlr4ng-cli` and generate TypeScript files from the grammar into `plugins/c4-structurizr/src/grammar/generated/`.

- [ ] **Step 7:** Verify the generated files exist by running:

```
ls plugins/c4-structurizr/src/grammar/generated/
```

Expected output should include: `StructurizrDSLLexer.ts`, `StructurizrDSLParser.ts`, `StructurizrDSLVisitor.ts`.
