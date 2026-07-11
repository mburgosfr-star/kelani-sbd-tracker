import { render, screen } from '@testing-library/react';
import App from './App';

beforeAll(() => {
  Object.defineProperty(window, 'scrollTo', {
    value: jest.fn(),
    writable: true,
  });
});

test('renders the Kelani splash screen', () => {
  render(<App />);
  expect(screen.getByAltText('Kelani')).toBeInTheDocument();
});
