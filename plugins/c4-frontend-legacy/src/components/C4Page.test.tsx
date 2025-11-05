import React from 'react';
import { render, screen } from '@testing-library/react';
import { TestApiRegistry, wrapInTestApp } from '@backstage/test-utils';
import { ApiProvider } from '@backstage/core-app-api';
import { c4ApiRef, C4Api, C4ViewModel } from '@fulgas/plugin-c4-frontend-common';
import { C4Page } from './C4Page';

jest.mock('@fulgas/plugin-c4-renderer-react', () => ({
  ReactC4Renderer: class {
    render() { return <div data-testid="mock-diagram" />; }
  },
}));

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false, media: query, onchange: null,
    addListener: jest.fn(), removeListener: jest.fn(),
    addEventListener: jest.fn(), removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

const emptyVm: C4ViewModel = {
  view: { id: 'v1', type: 'landscape', title: 'Landscape', entityRefs: [], relationshipIds: [], source: 'catalog' },
  model: { persons: [], systems: [], containers: [], components: [], relationships: [], views: [] },
};

function mockApi(): C4Api {
  return {
    getViews: jest.fn().mockResolvedValue([]),
    getView: jest.fn().mockResolvedValue(emptyVm),
    getEntityViews: jest.fn().mockResolvedValue([]),
    getLandscape: jest.fn().mockResolvedValue(emptyVm),
    triggerSync: jest.fn().mockResolvedValue({ status: 'started' }),
  };
}

describe('C4Page', () => {
  it('renders page header', () => {
    render(wrapInTestApp(<ApiProvider apis={TestApiRegistry.from([c4ApiRef, mockApi()])}><C4Page /></ApiProvider>));
    expect(screen.getByText('C4 Architecture')).toBeTruthy();
  });
});
