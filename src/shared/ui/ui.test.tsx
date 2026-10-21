import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Avatar, EmptyState, ErrorBoundary, OdyseeIcon, PageTitle, Spinner, Thumb, VirtualGrid } from '.';

describe('Avatar', () => {
  it('shows a letter without a source', () => {
    render(<Avatar name="zed" size={40} />);
    expect(screen.getByText('Z')).toBeInTheDocument();
  });

  it('uses the optimizer and falls back to the letter on failure', () => {
    render(<Avatar src="https://thumbs.odycdn.com/a.webp" name="Ann" size={40} />);
    const image = document.querySelector('img') as HTMLImageElement;
    expect(image.src).toContain('thumbnails.odycdn.com/optimize');
    fireEvent.error(image);
    expect(screen.getByText('A')).toBeInTheDocument();
    render(<Avatar src="https://thumbs.odycdn.com/a.webp" name="Ann" size={40} />);
    expect(document.querySelectorAll('img')).toHaveLength(0);
  });

  it('handles an empty name', () => {
    render(<Avatar name="" size={20} />);
    expect(screen.getByText('?')).toBeInTheDocument();
  });
});

describe('Thumb', () => {
  it('falls back from the optimized url to the original and then a placeholder', () => {
    const { container } = render(<Thumb src="https://thumbs.odycdn.com/a.webp" width={400} />);
    let image = container.querySelector('img') as HTMLImageElement;
    expect(image.src).toContain('optimize');
    fireEvent.error(image);
    image = container.querySelector('img') as HTMLImageElement;
    expect(image.src).toBe('https://thumbs.odycdn.com/a.webp');
    fireEvent.error(image);
    expect(container.querySelector('.thumb--empty')).not.toBeNull();
  });

  it('goes straight to the placeholder for plain urls and missing sources', () => {
    const { container, rerender } = render(<Thumb src="https://spee.ch/a.png" width={400} />);
    fireEvent.error(container.querySelector('img') as HTMLImageElement);
    expect(container.querySelector('.thumb--empty')).not.toBeNull();
    rerender(<Thumb src={null} width={400} />);
    expect(container.querySelector('.thumb--empty')).not.toBeNull();
    rerender(<Thumb src="https://spee.ch/b.png" width={400} />);
    expect(container.querySelector('img')).not.toBeNull();
  });
});

describe('VirtualGrid', () => {
  const items = Array.from({ length: 100 }, (_, index) => ({ id: String(index) }));
  const renderGrid = (activeIndex: number) => render(
    <VirtualGrid items={items} columns={4} cellWidth={100} cellHeight={80} gap={20} height={300} activeIndex={activeIndex} getKey={(item) => item.id} renderItem={(item, index, active) => <i data-active={active}>{item.id}:{index}</i>} />,
  );

  it('renders only the visible window', () => {
    renderGrid(0);
    expect(screen.getByText('0:0')).toBeInTheDocument();
    expect(screen.queryByText('99:99')).toBeNull();
    expect(document.querySelectorAll('.vcell').length).toBeLessThan(30);
  });

  it('scrolls to keep the active row visible', () => {
    renderGrid(80);
    expect(screen.getByText('80:80')).toBeInTheDocument();
    expect(screen.queryByText('0:0')).toBeNull();
    expect((document.querySelector('.vgrid__inner') as HTMLElement).style.transform).toContain('translate3d(0, -');
  });
});

describe('small components', () => {
  it('renders empty states and titles', () => {
    render(<><EmptyState title="Nothing" hint="Try later" icon={<b>icon</b>} /><PageTitle sub="sub">Title</PageTitle><Spinner inline /></>);
    expect(screen.getByText('Nothing')).toBeInTheDocument();
    expect(screen.getByText('Try later')).toBeInTheDocument();
    expect(screen.getByText('sub')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveClass('spinner--inline');
  });

  it('renders known icons only', () => {
    const { container, rerender } = render(<OdyseeIcon name="Fire" filled />);
    expect(container.querySelector('svg')).toHaveAttribute('fill', 'currentColor');
    rerender(<OdyseeIcon name="Fire" />);
    expect(container.querySelector('svg')).toHaveAttribute('fill', 'none');
    rerender(<OdyseeIcon name="Nope" />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('catches render errors', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const Boom = () => { throw new Error('exploded'); };
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('exploded')).toBeInTheDocument();
    render(<ErrorBoundary><span>fine</span></ErrorBoundary>);
    expect(screen.getByText('fine')).toBeInTheDocument();
  });
});
