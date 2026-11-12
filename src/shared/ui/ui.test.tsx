import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setSetting } from '@/shared/config';
import { pointerMoved, useKeys } from '@/shared/lib';
import { hoverOver } from '../../../tests/render';
import { Avatar, EmptyState, ErrorBoundary, iconKey, OdyseeIcon, OptionPicker, PageTitle, Spinner, SquircleDefs, Thumb, VirtualGrid } from '.';
import { ODYSEE_ICONS } from './icons';

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

  it('takes an extra class for the letter and the picture', () => {
    const { container, rerender } = render(<Avatar name="zed" size={40} className="avatar--corners" />);
    expect(container.firstElementChild?.className).toBe('avatar avatar--corners');
    rerender(<Avatar src="https://thumbs.odycdn.com/b.webp" name="Bo" size={40} className="avatar--corners" />);
    expect(container.firstElementChild?.className).toBe('avatar avatar--corners');
    rerender(<Avatar src="https://thumbs.odycdn.com/b.webp" name="Bo" size={40} />);
    expect(container.firstElementChild?.className).toBe('avatar');
  });
});

describe('SquircleDefs', () => {
  it('defines the outline in units of the box it cuts, drawn without size', () => {
    const { container } = render(<SquircleDefs />);
    const svg = container.querySelector('svg') as SVGElement;
    expect(svg.getAttribute('width')).toBe('0');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.querySelector('clipPath#squircle')?.getAttribute('clipPathUnits')).toBe('objectBoundingBox');
    expect(svg.querySelector('path')?.getAttribute('d')?.match(/C/g)).toHaveLength(8);
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

describe('Thumb on a card', () => {
  const MOVING = 'https://thumbs.odycdn.com/a.webp';
  const srcOf = (container: HTMLElement) => (container.querySelector('img') as HTMLImageElement).src;

  afterEach(() => { vi.useRealTimers(); });

  it('shows a still picture until the card has had the focus for a moment, then plays', () => {
    vi.useFakeTimers();
    const { container, rerender } = render(<Thumb src={MOVING} width={400} focused={false} />);
    expect(srcOf(container)).toBe('https://thumbnails.odycdn.com/card/s:400:225/quality:80/plain/https://thumbs.odycdn.com/a.webp');
    rerender(<Thumb src={MOVING} width={400} focused />);
    expect(srcOf(container)).toContain('/card/');
    act(() => { vi.advanceTimersByTime(200); });
    expect(srcOf(container)).toContain('/card/');
    act(() => { vi.advanceTimersByTime(100); });
    expect(srcOf(container)).toBe('https://thumbnails.odycdn.com/optimize/s:400:0/quality:80/plain/https://thumbs.odycdn.com/a.webp');
  });

  it('goes back to the still picture when the focus leaves, and does not load the moving one while passing by', () => {
    vi.useFakeTimers();
    const { container, rerender } = render(<Thumb src={MOVING} width={400} focused />);
    rerender(<Thumb src={MOVING} width={400} focused={false} />);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(srcOf(container)).toContain('/card/');
    rerender(<Thumb src={MOVING} width={400} focused />);
    act(() => { vi.advanceTimersByTime(300); });
    expect(srcOf(container)).toContain('/optimize/');
    rerender(<Thumb src={MOVING} width={400} focused={false} />);
    expect(srcOf(container)).toContain('/card/');
  });

  it('plays right away when nothing says it sits on a card', () => {
    const { container } = render(<Thumb src={MOVING} width={400} />);
    expect(srcOf(container)).toContain('/optimize/');
  });

  it('leaves thumbnails that cannot move alone', () => {
    const { container } = render(<Thumb src="https://thumbs.odycdn.com/a.jpg" width={400} focused={false} />);
    expect(srcOf(container)).toContain('/optimize/');
    const other = render(<Thumb src="https://spee.ch/a.png" width={400} focused={false} />);
    expect(srcOf(other.container)).toBe('https://spee.ch/a.png');
  });

  it('falls back to the optimizer and then the original when the still picture does not load', () => {
    const { container } = render(<Thumb src={MOVING} width={400} focused={false} />);
    fireEvent.error(container.querySelector('img') as HTMLImageElement);
    expect(srcOf(container)).toContain('/optimize/');
    fireEvent.error(container.querySelector('img') as HTMLImageElement);
    expect(srcOf(container)).toBe(MOVING);
    fireEvent.error(container.querySelector('img') as HTMLImageElement);
    expect(container.querySelector('.thumb--empty')).not.toBeNull();
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

describe('VirtualGrid at the end of a list', () => {
  const rows = Array.from({ length: 20 }, (_, index) => ({ id: String(index) }));

  it('leaves room below the last row for its focus ring', () => {
    render(<VirtualGrid items={rows} columns={1} cellWidth={100} cellHeight={76} gap={6} height={300} activeIndex={19} getKey={(item) => item.id} renderItem={(item) => <i>{item.id}</i>} />);
    expect((document.querySelector('.vgrid__inner') as HTMLElement).style.transform).toContain('-1354px');
  });

  it('does not scroll a list that fits', () => {
    render(<VirtualGrid items={rows.slice(0, 3)} columns={1} cellWidth={100} cellHeight={76} gap={6} height={300} activeIndex={2} getKey={(item) => item.id} renderItem={(item) => <i>{item.id}</i>} />);
    expect((document.querySelector('.vgrid__inner') as HTMLElement).style.transform).toContain('translate3d(0, 0px, 0)');
  });
});

describe('VirtualGrid with the cursor', () => {
  const items = Array.from({ length: 100 }, (_, index) => ({ id: String(index) }));
  const grid = (activeIndex: number) => (
    <VirtualGrid items={items} columns={4} cellWidth={100} cellHeight={80} gap={20} height={300} activeIndex={activeIndex} getKey={(item) => item.id} renderItem={(item) => <i>{item.id}</i>} />
  );
  const shift = () => (document.querySelector('.vgrid__inner') as HTMLElement).style.transform;

  it('stays where it is while the cursor picks a card on the screen, and follows the keys again', () => {
    pointerMoved({ nativeEvent: new MouseEvent('mousemove', { clientX: 9000, clientY: 9000 }) });
    const view = render(grid(0));
    expect(shift()).toContain('translate3d(0, 0px, 0)');
    view.rerender(grid(9));
    expect(shift()).toContain('translate3d(0, 0px, 0)');
    fireEvent.keyDown(window, { keyCode: 40 });
    view.rerender(grid(13));
    expect(shift()).not.toContain('translate3d(0, 0px, 0)');
  });

  it('still scrolls to a selection that is off the screen, for example when the list opens', () => {
    pointerMoved({ nativeEvent: new MouseEvent('mousemove', { clientX: 12000, clientY: 12000 }) });
    render(grid(80));
    expect(shift()).toContain('translate3d(0, -');
    expect(screen.getByText('80')).toBeInTheDocument();
  });
});

describe('OptionPicker with the cursor', () => {
  it('points at the option under the cursor, which previews and OK then confirms', () => {
    const onPreview = vi.fn();
    const onClose = vi.fn();
    render(<OptionPicker title="Pick" options={[{ code: 'a', name: 'Alpha' }, { code: 'b', name: 'Beta' }, { code: 'c', name: 'Gamma' }]} value="a" onPreview={onPreview} onClose={onClose} />);
    hoverOver(screen.getByText('Gamma'));
    expect(onPreview).toHaveBeenLastCalledWith('c');
    expect(document.querySelector('.pickerItem--active')?.textContent).toContain('Gamma');
    fireEvent.keyDown(window, { keyCode: 13 });
    expect(onClose).toHaveBeenCalledWith(true, 'c');
  });
});

describe('OptionPicker keys', () => {
  const press = (keyCode: number) => { fireEvent.keyDown(window, { keyCode }); if (keyCode === 13) fireEvent.keyUp(window, { keyCode }); };
  const options = [{ code: 'a', name: 'Alpha' }, { code: 'b', name: 'Beta' }, { code: 'c', name: 'Gamma' }];

  it('waits for the release of an OK that is still down when it opens, such as the one that opened the menu', () => {
    function Layer() { useKeys(() => false); return null; }
    render(<Layer />);
    fireEvent.keyDown(window, { keyCode: 13 });
    const onClose = vi.fn();
    render(<OptionPicker title="Pick" options={options} value="a" onClose={onClose} />);
    fireEvent.keyDown(window, { keyCode: 13 });
    fireEvent.keyDown(window, { keyCode: 13, repeat: true });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyUp(window, { keyCode: 13 });
    fireEvent.keyDown(window, { keyCode: 13, repeat: true });
    expect(onClose).not.toHaveBeenCalled();
    press(13);
    expect(onClose).toHaveBeenCalledWith(true, 'a');
  });

  it('works at once when OK is not down while it opens', () => {
    const onClose = vi.fn();
    render(<OptionPicker title="Pick" options={options} value="a" onClose={onClose} />);
    fireEvent.keyDown(window, { keyCode: 13 });
    expect(onClose).toHaveBeenCalledWith(true, 'a');
  });

  it('goes round from the last option to the first and back', () => {
    const onPreview = vi.fn();
    render(<OptionPicker title="Pick" options={options} value="a" onPreview={onPreview} onClose={vi.fn()} />);
    expect(onPreview).toHaveBeenLastCalledWith('a');
    press(38);
    expect(onPreview).toHaveBeenLastCalledWith('c');
    press(40);
    expect(onPreview).toHaveBeenLastCalledWith('a');
    press(40); press(40);
    expect(onPreview).toHaveBeenLastCalledWith('c');
    press(40);
    expect(onPreview).toHaveBeenLastCalledWith('a');
  });
});

describe('OptionPicker as a popover', () => {
  const options = (count: number) => Array.from({ length: count }, (_, index) => ({ code: `c${index}`, name: `Choice ${index}` }));
  const height = () => (document.querySelector('.vgrid') as HTMLElement).style.height;

  it('sits next to the picture and is only as tall as its entries, with a few more rows scrolling', () => {
    const { rerender } = render(<OptionPicker title="Pick" options={options(3)} value="c0" placement="popover" onClose={vi.fn()} />);
    expect(document.querySelector('.picker')).toHaveClass('picker--popover');
    expect(height()).toBe('228px');
    rerender(<OptionPicker title="Pick" options={options(5)} value="c0" placement="popover" onClose={vi.fn()} />);
    expect(height()).toBe('372px');
    rerender(<OptionPicker title="Pick" options={options(7)} value="c0" placement="popover" onClose={vi.fn()} />);
    expect(height()).toBe('360px');
  });

  it('keeps the centered size for the others, whatever the number of entries', () => {
    render(<OptionPicker title="Pick" options={options(3)} value="c0" onClose={vi.fn()} />);
    expect(document.querySelector('.picker')).not.toHaveClass('picker--popover');
    expect(height()).toBe('588px');
  });

  it('is dismissed by a click next to the panel and not by a click on it', () => {
    const onDismiss = vi.fn();
    render(<OptionPicker title="Pick" options={options(3)} value="c0" placement="popover" onDismiss={onDismiss} onClose={vi.fn()} />);
    fireEvent.click(document.querySelector('.picker__panel') as HTMLElement);
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.click(document.querySelector('.picker') as HTMLElement);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('goes back like Back when nobody asked to hear about the click next to it', () => {
    const onClose = vi.fn();
    render(<OptionPicker title="Pick" options={options(3)} value="c1" placement="popover" onClose={onClose} />);
    fireEvent.click(document.querySelector('.picker') as HTMLElement);
    expect(onClose).toHaveBeenCalledWith(false, 'c1');
  });
});

describe('OptionPicker click outside', () => {
  const options = [{ code: 'a', name: 'Alpha' }, { code: 'b', name: 'Beta' }, { code: 'c', name: 'Gamma' }];
  const backdrop = () => document.querySelector('.picker') as HTMLElement;
  const outside = () => { fireEvent.mouseDown(backdrop()); fireEvent.mouseUp(backdrop()); fireEvent.click(backdrop()); };

  it('closes the centered picker like Back, with the entry it was on', () => {
    const onClose = vi.fn();
    render(<OptionPicker title="Pick" options={options} value="b" onClose={onClose} />);
    outside();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith(false, 'b');
  });

  it('does not close for a click on the panel, its title or an entry that is not picked by it', () => {
    const onClose = vi.fn();
    render(<OptionPicker title="Pick" options={options} value="a" onClose={onClose} />);
    fireEvent.mouseDown(screen.getByText('Pick'));
    fireEvent.click(screen.getByText('Pick'));
    fireEvent.click(document.querySelector('.picker__panel') as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('leaves it to the one who asked to hear about it to close', () => {
    const onClose = vi.fn();
    const onDismiss = vi.fn();
    render(<OptionPicker title="Pick" options={options} value="a" onDismiss={onDismiss} onClose={onClose} />);
    outside();
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not close when the press started on the panel and was let go next to it, and then works again', () => {
    const onClose = vi.fn();
    render(<OptionPicker title="Pick" options={options} value="a" onClose={onClose} />);
    fireEvent.mouseDown(screen.getByText('Beta'));
    fireEvent.mouseUp(backdrop());
    fireEvent.click(backdrop());
    expect(onClose).not.toHaveBeenCalled();
    outside();
    expect(onClose).toHaveBeenCalledWith(false, 'a');
  });

  it('also works for a click without a press before it', () => {
    const onClose = vi.fn();
    render(<OptionPicker title="Pick" options={options} value="a" onClose={onClose} />);
    fireEvent.click(backdrop());
    expect(onClose).toHaveBeenCalledWith(false, 'a');
  });
});

describe('OdyseeIcon in lists', () => {
  it('is marked to follow the Menu Icon Style only when asked, and stays drawn with lines', () => {
    const { container } = render(<><OdyseeIcon name="Pop Culture" size={30} follow /><OdyseeIcon name="Pop Culture" size={30} /></>);
    const [followed, plain] = Array.from(container.querySelectorAll('svg'));
    expect(followed.getAttribute('class')).toBe('odyIcon');
    expect(followed.getAttribute('fill')).toBe('none');
    expect(plain.hasAttribute('class')).toBe(false);
  });
});

describe('Spinner', () => {
  afterEach(() => { setSetting('loaderStyle', 'ring'); });

  it('shows the ring by default', () => {
    const { container } = render(<Spinner />);
    const spinner = screen.getByRole('status');
    expect(spinner).toHaveClass('loading-spinner', 'loading-spinner--inline', 'loader-ring');
    expect(spinner).toHaveAttribute('aria-label', 'Loading');
    expect(spinner.innerHTML).toBe('');
    expect(container.querySelector('img')).toBeNull();
    expect(spinner).not.toHaveClass('spinner');
  });

  it.each(['odysee', 'pulse'])('leaves the Odysee animations to the start screen, a stored choice of %s shows the ring', (stored) => {
    setSetting('loaderStyle', stored);
    render(<Spinner />);
    const spinner = screen.getByRole('status');
    expect(spinner).toHaveClass('loader-ring');
    expect(spinner.className).not.toContain(stored);
    expect(spinner.querySelector('svg')).toBeNull();
    expect(spinner.querySelector('img')).toBeNull();
  });

  it('follows the loading animation chosen in Settings', () => {
    setSetting('loaderStyle', 'typing');
    const { rerender } = render(<Spinner />);
    expect(screen.getByRole('status')).toHaveClass('loader-typing');
    act(() => setSetting('loaderStyle', 'bounce'));
    rerender(<Spinner />);
    expect(screen.getByRole('status')).toHaveClass('loader-bounce');
    expect(screen.getByRole('status').querySelectorAll('i')).toHaveLength(3);
    act(() => setSetting('loaderStyle', 'ripple'));
    expect(screen.getByRole('status')).toHaveClass('loader-ripple');
    expect(screen.getByRole('status').querySelectorAll('i')).toHaveLength(3);
    expect(screen.getByRole('status').querySelectorAll('b')).toHaveLength(1);
    act(() => setSetting('loaderStyle', 'arcs'));
    expect(screen.getByRole('status')).toHaveClass('loader-arcs');
    act(() => setSetting('loaderStyle', 'dots'));
    rerender(<Spinner />);
    expect(screen.getByRole('status')).toHaveClass('loader-dots');
    expect(screen.getByRole('status').querySelectorAll('i')).toHaveLength(3);
  });

  it('falls back to the ring for an unknown stored style', () => {
    setSetting('loaderStyle', 'spinning-cat');
    render(<Spinner />);
    const spinner = screen.getByRole('status');
    expect(spinner).toHaveClass('loader-ring');
    expect(spinner.className).not.toContain('spinning-cat');
  });

  it('scales the animation with the scale prop and defaults to 1', () => {
    const { rerender } = render(<Spinner />);
    expect(screen.getByRole('status').style.getPropertyValue('--boot-scale')).toBe('1');
    rerender(<Spinner scale={0.5} />);
    expect(screen.getByRole('status').style.getPropertyValue('--boot-scale')).toBe('0.5');
  });

  it('stays a plain ring when inline, as it sits inside buttons', () => {
    render(<Spinner inline scale={2} />);
    const spinner = screen.getByRole('status');
    expect(spinner).toHaveClass('spinner', 'spinner--inline');
    expect(spinner.className).not.toContain('loader-');
    expect(spinner.className).not.toContain('loading-spinner');
    expect(spinner.querySelector('img')).toBeNull();
    expect(spinner.style.getPropertyValue('--boot-scale')).toBe('');
    expect(spinner.innerHTML).toBe('');
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

  it('draws every icon that the Odysee homepage names, with the viewBox of Odysee', () => {
    const viewBoxes: Record<string, string> = {
      Aperature: '0 0 21 18', Artists: '0 0 20 18', Comedy: '0 0 19 20', DollarSign: '0 0 20 20', Education: '0 0 20 15', Featured: '0 0 22 22',
      Gaming: '0 0 20 20', Horror: '0 0 20 21', Life: '0 0 24 24', Lifestyle: '0 0 19 17', MindBlown: '0 0 25 24', MusicCategory: '0 0 19 20',
      Peace: '0 0 24 24', 'Pop Culture': '0 0 20 15', Speaker: '0 0 21 20', Spirituality: '0 0 18 17', Sports: '0 0 21 20', Universe: '0 0 21 20',
      WildWest: '0 0 24 24',
    };
    expect(Object.keys(viewBoxes)).toHaveLength(19);
    Object.entries(viewBoxes).forEach(([name, viewBox]) => {
      const { container, unmount } = render(<OdyseeIcon name={name} size={40} />);
      const svg = container.querySelector('svg');
      expect(svg, name).not.toBeNull();
      expect(svg).toHaveAttribute('viewBox', viewBox);
      expect(svg).toHaveAttribute('fill', 'none');
      expect(svg).toHaveAttribute('width', '40');
      expect(svg?.querySelectorAll('path, circle').length, name).toBeGreaterThan(0);
      unmount();
    });
    expect(Object.keys(ODYSEE_ICONS).sort()).toEqual([...Object.keys(viewBoxes), 'Fire', 'Slime'].sort());
  });

  it('keeps the drawings free of anything that could break out of a template', () => {
    Object.entries(ODYSEE_ICONS).forEach(([name, icon]) => {
      expect(icon.body, name).not.toMatch(/[`{}]|\$\{|<script|\son\w+=|\sid=|xmlns/);
      expect(icon.body, name).not.toMatch(/[A-Z]\w*=/);
      expect(Number(icon.strokeWidth), name).toBeGreaterThan(1);
    });
  });

  it('finds an icon whatever its case, spacing or punctuation', () => {
    const { container, rerender } = render(<OdyseeIcon name="Pop Culture" />);
    expect(container.querySelector('svg')).toHaveAttribute('viewBox', '0 0 20 15');
    expect(container.querySelector('svg path')?.getAttribute('d')).toMatch(/^M4\.26667 8\.61538/);
    ['PopCulture', 'pop culture', 'POP-CULTURE'].forEach((name) => {
      rerender(<OdyseeIcon name={name} />);
      expect(container.querySelector('svg')).toHaveAttribute('viewBox', '0 0 20 15');
    });
    rerender(<OdyseeIcon name="speaker" />);
    expect(container.querySelector('svg')).toHaveAttribute('viewBox', '0 0 21 20');
    ['', 'Pop', 'constructor', '__proto__'].forEach((name) => {
      rerender(<OdyseeIcon name={name} />);
      expect(container.querySelector('svg')).toBeNull();
    });
    expect(iconKey('Pop Culture')).toBe('Pop Culture');
    expect(iconKey('mind blown')).toBe('MindBlown');
    expect(iconKey(undefined)).toBeNull();
    expect(iconKey('')).toBeNull();
  });

  it('keeps the like and dislike icons switchable between outlined and filled', () => {
    const { container, rerender } = render(<OdyseeIcon name="Slime" filled />);
    expect(container.querySelector('svg')).toHaveAttribute('fill', 'currentColor');
    rerender(<OdyseeIcon name="Slime" />);
    expect(container.querySelector('svg')).toHaveAttribute('fill', 'none');
    expect(container.querySelector('svg')).toHaveAttribute('viewBox', '0 0 24 24');
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
