import { ApiProvider } from '@backstage/core-app-api';
import { TestApiRegistry, wrapInTestApp } from '@backstage/test-utils';
import { C4Api, c4ApiRef } from '@fulgas/plugin-c4-frontend-common';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { C4PageContent } from './C4PageExtension';

jest.mock('@fulgas/plugin-c4-renderer-react', () => ({
  ReactC4Renderer: class {
    render() { return <div data-testid="mock-diagram" />; }
  },
}));

function mockApi(): C4Api {
  return {
    getViewDescriptors: jest.fn().mockResolvedValue([]),
    getDiagram: jest.fn().mockResolvedValue(undefined),
    getEntityViewDescriptors: jest.fn().mockResolvedValue([]),
    triggerSync: jest.fn().mockResolvedValue({ status: 'started' }),
  };
}

describe('C4PageContent', () => {
  it('renders C4 Architecture Diagrams header', () => {
    render(wrapInTestApp(<ApiProvider apis={TestApiRegistry.from([c4ApiRef, mockApi()])}><C4PageContent /></ApiProvider>));
    expect(screen.getByText('C4 Architecture Diagrams')).toBeTruthy();
  });
});
