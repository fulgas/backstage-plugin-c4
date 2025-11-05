import { StructurizrParser } from './StructurizrParser';

const DSL = `
workspace {
  model {
    user = person "User" "A user"
    ss = softwareSystem "Banking System" "Manages accounts" {
      api = container "API" "Core API" "TypeScript"
      web = container "Web App" "Frontend" "React"
    }
    user -> ss "Uses"
  }
  views {
    systemContext ss "SystemContext" {}
    container ss "Containers" {}
  }
}
`;

describe('StructurizrParser', () => {
  let parser: StructurizrParser;
  beforeEach(() => { parser = new StructurizrParser(); });

  it('parses persons', () => {
    const r = parser.parse(DSL);
    expect(r.persons).toHaveLength(1);
    expect(r.persons[0].name).toBe('User');
    expect(r.persons[0].varName).toBe('user');
  });

  it('parses systems', () => {
    const r = parser.parse(DSL);
    expect(r.systems).toHaveLength(1);
    expect(r.systems[0].name).toBe('Banking System');
  });

  it('parses containers', () => {
    const r = parser.parse(DSL);
    expect(r.systems[0].containers).toHaveLength(2);
    expect(r.systems[0].containers[0].technology).toBe('TypeScript');
  });

  it('parses relationships', () => {
    const r = parser.parse(DSL);
    expect(r.relationships).toHaveLength(1);
    expect(r.relationships[0].sourceVar).toBe('user');
  });

  it('parses context views', () => {
    const r = parser.parse(DSL);
    expect(r.contextViews[0].key).toBe('SystemContext');
  });

  it('parses container views', () => {
    const r = parser.parse(DSL);
    expect(r.containerViews[0].key).toBe('Containers');
  });

  it('handles bad DSL without throwing', () => {
    expect(() => parser.parse('not valid {')).not.toThrow();
  });
});
