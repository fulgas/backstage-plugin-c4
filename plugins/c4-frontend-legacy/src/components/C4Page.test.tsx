import { ApiProvider } from '@backstage/core-app-api';
import { TestApiRegistry, wrapInTestApp } from '@backstage/test-utils';
import { C4Api, c4ApiRef } from '@fulgas/plugin-c4-frontend-common';
import { C4ViewDescriptor } from '@fulgas/plugin-c4-node';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { C4Page } from './C4Page';

// Render Backstage Select as native <select> so tests can interact with it
jest.mock('@backstage/core-components', () => {
  const actual = jest.requireActual('@backstage/core-components');
  return {
    ...actual,
    Select: ({ label, items, selected, onChange }: any) => (
      <select
        aria-label={label}
        value={selected}
        onChange={e => onChange(e.target.value)}
      >
        {items.map((item: any) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
    ),
  };
});

const mockUseEntityList = jest.fn();
// Module-level map populated before each test so EntityDisplayName mock can look up titles
const entityTitles: Record<string, string> = {};

jest.mock('@backstage/plugin-catalog-react', () => {
  const actual = jest.requireActual('@backstage/plugin-catalog-react');
  return {
    ...actual,
    EntityListProvider: ({ children }: any) => <>{children}</>,
    EntityDisplayName: ({ entityRef }: any) => {
      const ref =
        typeof entityRef === 'string'
          ? entityRef
          : `${entityRef.kind}:${entityRef.namespace}/${entityRef.name}`;
      return <span>{entityTitles[ref] ?? ref.split('/').pop()}</span>;
    },
    EntityKindPicker: () => null,
    EntityOwnerPicker: () => null,
    EntityRefLinks: ({ entityRefs }: any) => (
      <span>{entityRefs?.map((r: any) => r.name ?? r).join(', ')}</span>
    ),
    UserListPicker: () => null,
    useEntityList: () => mockUseEntityList(),
    getEntityRelations: (_entity: any, _type: string) => [],
  };
});

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

const DESCRIPTORS: C4ViewDescriptor[] = [
  {
    id: 'retail-domain',
    title: 'Retail Domain',
    subjectId: 'domain:default/retail',
    entityRef: 'domain:default/retail',
    source: 'catalog',
    level: 'landscape',
  },
  {
    id: 'payment-service',
    title: 'Payment Service',
    subjectId: 'component:default/payment-service',
    entityRef: 'component:default/payment-service',
    source: 'catalog',
    level: 'container',
    parentTitle: 'Payment System',
    parentEntityRef: 'system:default/payment-system',
  },
  {
    id: 'order-api',
    title: 'Order API',
    subjectId: 'component:default/order-api',
    entityRef: 'component:default/order-api',
    source: 'dsl',
    level: 'container',
    parentTitle: 'Order System',
    parentEntityRef: 'system:default/order-system',
  },
];

const ENTITIES = [
  { kind: 'Domain', metadata: { namespace: 'default', name: 'retail' } },
  {
    kind: 'Component',
    metadata: { namespace: 'default', name: 'payment-service' },
  },
  { kind: 'Component', metadata: { namespace: 'default', name: 'order-api' } },
];

function mockApi(overrides: Partial<C4Api> = {}): C4Api {
  return {
    getViewDescriptors: jest.fn().mockResolvedValue(DESCRIPTORS),
    getDiagram: jest.fn().mockResolvedValue(undefined),
    getEntityViewDescriptors: jest.fn().mockResolvedValue([]),
    triggerSync: jest.fn().mockResolvedValue({ status: 'started' }),
    updateViewSettings: jest.fn().mockResolvedValue(undefined),
    saveNodePositions: jest.fn().mockResolvedValue(undefined),
    resetNodePositions: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function renderPage(api: C4Api = mockApi()) {
  return render(
    wrapInTestApp(
      <ApiProvider apis={TestApiRegistry.from([c4ApiRef, api])}>
        <C4Page />
      </ApiProvider>,
    ),
  );
}

beforeEach(() => {
  mockUseEntityList.mockReturnValue({
    entities: ENTITIES,
    loading: false,
    totalItems: ENTITIES.length,
  });
  // Populate title lookup so EntityDisplayName mock renders correct titles
  for (const d of DESCRIPTORS) {
    if (d.entityRef) entityTitles[d.entityRef] = d.title;
    if (d.parentEntityRef && d.parentTitle)
      entityTitles[d.parentEntityRef] = d.parentTitle;
  }
});

describe('C4Page', () => {
  it('renders page header', () => {
    renderPage();
    expect(screen.getByText('C4 Architecture')).toBeTruthy();
  });

  describe('table', () => {
    it('shows all diagrams that have matching entities', async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByText('Retail Domain')).toBeTruthy(),
      );
      expect(screen.getByText('Payment Service')).toBeTruthy();
      expect(screen.getByText('Order API')).toBeTruthy();
    });

    it('excludes entities that have no C4 descriptor', async () => {
      mockUseEntityList.mockReturnValue({
        entities: [
          ...ENTITIES,
          {
            kind: 'Component',
            metadata: { namespace: 'default', name: 'no-diagram' },
          },
        ],
        loading: false,
        totalItems: 4,
      });
      renderPage();
      await waitFor(() =>
        expect(screen.getByText('Retail Domain')).toBeTruthy(),
      );
      expect(screen.queryByText('no-diagram')).toBeNull();
    });

    it('name column renders as a link', async () => {
      renderPage();
      await waitFor(() =>
        expect(
          screen.getByRole('link', { name: 'Retail Domain' }),
        ).toBeTruthy(),
      );
      expect(
        screen.getByRole('link', { name: 'Payment Service' }),
      ).toBeTruthy();
    });

    it('parent column shows parent title as a link when parentEntityRef exists', async () => {
      renderPage();
      await waitFor(() =>
        expect(
          screen.getByRole('link', { name: 'Payment System' }),
        ).toBeTruthy(),
      );
      expect(screen.getByRole('link', { name: 'Order System' })).toBeTruthy();
    });

    it('parent column shows em-dash for root nodes', async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByText('Retail Domain')).toBeTruthy(),
      );
      expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    });
  });

  describe('Type (level) filter', () => {
    it('hides rows that do not match the selected level', async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByText('Retail Domain')).toBeTruthy(),
      );

      await userEvent.selectOptions(screen.getByLabelText('Type'), 'landscape');

      expect(screen.getByText('Retail Domain')).toBeTruthy();
      expect(screen.queryByText('Payment Service')).toBeNull();
      expect(screen.queryByText('Order API')).toBeNull();
    });

    it('shows all rows when reset to All types', async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByText('Retail Domain')).toBeTruthy(),
      );

      await userEvent.selectOptions(screen.getByLabelText('Type'), 'landscape');
      await userEvent.selectOptions(screen.getByLabelText('Type'), 'all');

      expect(screen.getByText('Retail Domain')).toBeTruthy();
      expect(screen.getByText('Payment Service')).toBeTruthy();
      expect(screen.getByText('Order API')).toBeTruthy();
    });
  });

  describe('entity list integration', () => {
    it('reflects entity list filtering (e.g. kind filter from EntityKindPicker)', async () => {
      mockUseEntityList.mockReturnValue({
        entities: [
          {
            kind: 'Component',
            metadata: { namespace: 'default', name: 'payment-service' },
          },
        ],
        loading: false,
        totalItems: 1,
      });

      renderPage();
      await waitFor(() =>
        expect(screen.getByText('Payment Service')).toBeTruthy(),
      );
      expect(screen.queryByText('Retail Domain')).toBeNull();
      expect(screen.queryByText('Order API')).toBeNull();
    });
  });
});
