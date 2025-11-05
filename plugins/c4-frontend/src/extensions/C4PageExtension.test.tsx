import { ApiProvider } from '@backstage/core-app-api';
import { TestApiRegistry, wrapInTestApp } from '@backstage/test-utils';
import { C4Api, c4ApiRef, C4ViewModel } from '@fulgas/plugin-c4-frontend-common';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { C4PageContent } from './C4PageExtension';

jest.mock('@fulgas/plugin-c4-renderer-react', () => ({
  ReactC4Renderer: class {
    render() { return <div data-testid="mock-diagram" />; }
  },
}));

const vm: C4ViewModel = {
  view: { id: 'v1', type: 'landscape', title: 'L', entityRefs: [], relationshipIds: [], source: 'catalog' },
  model: { persons: [], systems: [], containers: [], components: [], relationships: [], views: [] },
};

function mockApi(): C4Api {
  return {
    getViews: jest.fn().mockResolvedValue([]),
    getView: jest.fn().mockResolvedValue(vm),
    getEntityViews: jest.fn().mockResolvedValue([]),
    getLandscape: jest.fn().mockResolvedValue(vm),
    getViewHistory: jest.fn().mockResolvedValue([]),
    getViewDiff: jest.fn().mockResolvedValue({ added: {}, removed: {}, changed: {} }),
    triggerSync: jest.fn().mockResolvedValue({ status: 'started' }),
  };
}

describe('C4PageContent', () => {
  it('renders C4 Architecture Diagrams header', () => {
    render(wrapInTestApp(<ApiProvider apis={TestApiRegistry.from([c4ApiRef, mockApi()])}><C4PageContent /></ApiProvider>));
    expect(screen.getByText('C4 Architecture Diagrams')).toBeTruthy();
  });
});
