import React from 'react';
import { render, screen } from '@testing-library/react';
import { TestApiRegistry, wrapInTestApp } from '@backstage/test-utils';
import { ApiProvider } from '@backstage/core-app-api';
import { c4ApiRef, C4Api } from '@fulgas/plugin-c4-frontend-common';
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

function mockApi(): C4Api {
  return {
    getViewDescriptors: jest.fn().mockResolvedValue([]),
    getDiagram: jest.fn().mockResolvedValue(undefined),
    getEntityViewDescriptors: jest.fn().mockResolvedValue([]),
    triggerSync: jest.fn().mockResolvedValue({ status: 'started' }),
  };
}

describe('C4Page', () => {
  it('renders page header', () => {
    render(wrapInTestApp(<ApiProvider apis={TestApiRegistry.from([c4ApiRef, mockApi()])}><C4Page /></ApiProvider>));
    expect(screen.getByText('C4 Architecture')).toBeTruthy();
  });
});
