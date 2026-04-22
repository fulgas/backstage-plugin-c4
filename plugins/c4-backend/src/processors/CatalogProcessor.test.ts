import { AuthService } from '@backstage/backend-plugin-api';
import { CatalogClient } from '@backstage/catalog-client';
import { Entity } from '@backstage/catalog-model';
import { CatalogProcessor } from './CatalogProcessor';

function mockCatalogClient(entities: Entity[]): jest.Mocked<CatalogClient> {
  return {
    getEntities: jest.fn().mockResolvedValue({ items: entities }),
  } as unknown as jest.Mocked<CatalogClient>;
}

function mockAuth(): jest.Mocked<AuthService> {
  return {
    getPluginRequestToken: jest.fn().mockResolvedValue({ token: 'test-token' }),
    getOwnServiceCredentials: jest.fn().mockResolvedValue({}),
  } as unknown as jest.Mocked<AuthService>;
}

const domainEntity: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Domain',
  metadata: { name: 'my-domain', namespace: 'default', uid: 'domain-uid-1' },
  spec: { owner: 'team-a' },
  relations: [{ type: 'hasPart', targetRef: 'system:default/my-system' }],
};

const systemEntity: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'System',
  metadata: { name: 'my-system', namespace: 'default', uid: 'system-uid-1' },
  spec: { owner: 'team-a', domain: 'my-domain' },
  relations: [
    { type: 'partOf', targetRef: 'domain:default/my-domain' },
    { type: 'hasPart', targetRef: 'component:default/my-service' },
  ],
};

const componentEntity: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: { name: 'my-service', namespace: 'default', uid: 'comp-uid-1' },
  spec: { type: 'service', owner: 'team-a', system: 'my-system' },
  relations: [
    { type: 'partOf', targetRef: 'system:default/my-system' },
    { type: 'dependsOn', targetRef: 'component:default/other-service' },
    { type: 'providesApi', targetRef: 'api:default/my-api' },
  ],
};

const resourceEntity: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Resource',
  metadata: { name: 'my-db', namespace: 'default', uid: 'res-uid-1' },
  spec: { type: 'database', owner: 'team-a', system: 'my-system' },
  relations: [{ type: 'partOf', targetRef: 'system:default/my-system' }],
};

const subdomainEntity: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Domain',
  metadata: { name: 'payments', namespace: 'default', uid: 'payments-uid-1' },
  spec: { owner: 'team-a', subdomainOf: 'my-domain' },
  relations: [{ type: 'partOf', targetRef: 'domain:default/my-domain' }],
};

const subcomponentEntity: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name: 'payment-gateway-client',
    namespace: 'default',
    uid: 'subcomp-uid-1',
  },
  spec: {
    type: 'library',
    owner: 'team-a',
    system: 'my-system',
    subcomponentOf: 'my-service',
  },
  relations: [
    { type: 'childOf', targetRef: 'component:default/my-service' },
    { type: 'partOf', targetRef: 'system:default/my-system' },
  ],
};

const groupEntity: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Group',
  metadata: { name: 'team-a', namespace: 'default', uid: 'group-uid-1' },
  spec: { type: 'team', children: [] },
  relations: [],
};

describe('CatalogProcessor', () => {
  it('maps Domain → C4Node depth 0', async () => {
    const processor = new CatalogProcessor(
      mockCatalogClient([domainEntity]),
      mockAuth(),
    );
    const { model } = await processor.process();

    const node = model.nodes.find(n => n.id === 'domain:default/my-domain');
    expect(node).toBeDefined();
    expect(node!.depth).toBe(0);
    expect(node!.parentId).toBeUndefined();
  });

  it('maps System → C4Node depth 1 with parentId = domain', async () => {
    const processor = new CatalogProcessor(
      mockCatalogClient([domainEntity, systemEntity]),
      mockAuth(),
    );
    const { model } = await processor.process();

    const node = model.nodes.find(n => n.id === 'system:default/my-system');
    expect(node).toBeDefined();
    expect(node!.depth).toBe(1);
    expect(node!.parentId).toBe('domain:default/my-domain');
  });

  it('maps Component → C4Node depth 2 with parentId = system', async () => {
    const processor = new CatalogProcessor(
      mockCatalogClient([systemEntity, componentEntity]),
      mockAuth(),
    );
    const { model } = await processor.process();

    const node = model.nodes.find(n => n.id === 'component:default/my-service');
    expect(node).toBeDefined();
    expect(node!.depth).toBe(2);
    expect(node!.parentId).toBe('system:default/my-system');
    expect(node!.subType).toBe('service');
  });

  it('sets parentId for subdomain via partOf relation to parent domain', async () => {
    const processor = new CatalogProcessor(
      mockCatalogClient([domainEntity, subdomainEntity]),
      mockAuth(),
    );
    const { model, descriptors } = await processor.process();

    const subdomain = model.nodes.find(n => n.id === 'domain:default/payments');
    expect(subdomain).toBeDefined();
    expect(subdomain!.depth).toBe(0);
    expect(subdomain!.parentId).toBe('domain:default/my-domain');
    expect(subdomain!.navigable).toBe(true);
    // Subdomain still gets its own landscape descriptor
    expect(
      descriptors.find(d => d.subjectId === 'domain:default/payments'),
    ).toBeDefined();
  });

  it('sets navigable=true for Domain, System, Component', async () => {
    const processor = new CatalogProcessor(
      mockCatalogClient([domainEntity, systemEntity, componentEntity]),
      mockAuth(),
    );
    const { model } = await processor.process();

    expect(
      model.nodes.find(n => n.id === 'domain:default/my-domain')!.navigable,
    ).toBe(true);
    expect(
      model.nodes.find(n => n.id === 'system:default/my-system')!.navigable,
    ).toBe(true);
    expect(
      model.nodes.find(n => n.id === 'component:default/my-service')!.navigable,
    ).toBe(true);
  });

  it('maps subcomponent → depth-3 with parentId = parent component, navigable=false', async () => {
    const processor = new CatalogProcessor(
      mockCatalogClient([systemEntity, componentEntity, subcomponentEntity]),
      mockAuth(),
    );
    const { model, descriptors } = await processor.process();

    const node = model.nodes.find(
      n => n.id === 'component:default/payment-gateway-client',
    );
    expect(node).toBeDefined();
    expect(node!.depth).toBe(3);
    expect(node!.parentId).toBe('component:default/my-service');
    expect(node!.navigable).toBe(false);
    // Subcomponents do not get their own descriptor
    expect(
      descriptors.find(
        d => d.subjectId === 'component:default/payment-gateway-client',
      ),
    ).toBeUndefined();
  });

  it('rolls up depth-3→depth-3 cross-component edges to depth-2→depth-2', async () => {
    const subcompA: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: { name: 'sub-a', namespace: 'default' },
      spec: { type: 'library' },
      relations: [
        { type: 'childOf', targetRef: 'component:default/comp-a' },
        { type: 'dependsOn', targetRef: 'component:default/sub-b' },
      ],
    };
    const subcompB: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: { name: 'sub-b', namespace: 'default' },
      spec: { type: 'library' },
      relations: [{ type: 'childOf', targetRef: 'component:default/comp-b' }],
    };
    const processor = new CatalogProcessor(
      mockCatalogClient([subcompA, subcompB]),
      mockAuth(),
    );
    const { model } = await processor.process();

    const rolledUp = model.relationships.find(
      r =>
        r.sourceId === 'component:default/comp-a' &&
        r.targetId === 'component:default/comp-b',
    );
    expect(rolledUp).toBeDefined();
  });

  it('sets navigable=false for Resource and emits no container descriptor', async () => {
    const processor = new CatalogProcessor(
      mockCatalogClient([systemEntity, resourceEntity]),
      mockAuth(),
    );
    const { model, descriptors } = await processor.process();

    const node = model.nodes.find(n => n.id === 'resource:default/my-db');
    expect(node).toBeDefined();
    expect(node!.navigable).toBe(false);
    expect(node!.subType).toBe('database');
    expect(
      descriptors.find(d => d.subjectId === 'resource:default/my-db'),
    ).toBeUndefined();
  });

  it('maps Group → C4Actor (not a node)', async () => {
    const processor = new CatalogProcessor(
      mockCatalogClient([groupEntity]),
      mockAuth(),
    );
    const { model } = await processor.process();

    expect(model.actors).toHaveLength(1);
    expect(model.actors[0].id).toBe('group:default/team-a');
    expect(model.nodes).toHaveLength(0);
  });

  it('emits a landscape descriptor for each Domain', async () => {
    const processor = new CatalogProcessor(
      mockCatalogClient([domainEntity, systemEntity]),
      mockAuth(),
    );
    const { descriptors } = await processor.process();

    const landscape = descriptors.find(
      d => d.subjectId === 'domain:default/my-domain',
    );
    expect(landscape).toBeDefined();
    expect(landscape!.source).toBe('catalog');
  });

  it('emits a context descriptor for each System', async () => {
    const processor = new CatalogProcessor(
      mockCatalogClient([systemEntity]),
      mockAuth(),
    );
    const { descriptors } = await processor.process();

    const context = descriptors.find(
      d => d.subjectId === 'system:default/my-system',
    );
    expect(context).toBeDefined();
  });

  it('emits a container descriptor for each Component', async () => {
    const processor = new CatalogProcessor(
      mockCatalogClient([systemEntity, componentEntity]),
      mockAuth(),
    );
    const { descriptors } = await processor.process();

    const container = descriptors.find(
      d => d.subjectId === 'component:default/my-service',
    );
    expect(container).toBeDefined();
  });

  it('creates relationship from dependsOn', async () => {
    const processor = new CatalogProcessor(
      mockCatalogClient([componentEntity]),
      mockAuth(),
    );
    const { model } = await processor.process();

    const rel = model.relationships.find(
      r =>
        r.sourceId === 'component:default/my-service' &&
        r.targetId === 'component:default/other-service',
    );
    expect(rel).toBeDefined();
    expect(rel!.description).toBe('depends on');
  });

  it('rolls up container→container edges to system→system', async () => {
    const consumer: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: { name: 'svc-a', namespace: 'default' },
      spec: { type: 'service' },
      relations: [
        { type: 'partOf', targetRef: 'system:default/sys-a' },
        { type: 'dependsOn', targetRef: 'component:default/svc-b' },
      ],
    };
    const provider: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: { name: 'svc-b', namespace: 'default' },
      spec: { type: 'service' },
      relations: [{ type: 'partOf', targetRef: 'system:default/sys-b' }],
    };
    const processor = new CatalogProcessor(
      mockCatalogClient([consumer, provider]),
      mockAuth(),
    );
    const { model } = await processor.process();

    const sysRel = model.relationships.find(
      r =>
        r.sourceId === 'system:default/sys-a' &&
        r.targetId === 'system:default/sys-b',
    );
    expect(sysRel).toBeDefined();
  });
});
