import React, { useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { useWindowEvent } from '@mantine/hooks';
import VideoCard from './VideoCard';
import { KEYCODE_LEFT, KEYCODE_RIGHT, KEYCODE_ENTER } from '../constants';

const VideoCarousel = React.memo(forwardRef(function VideoCarousel(
  { videos, isActive, showSelection, activeIndex, onNavigate, onSelect, onFocusSidebar },
  ref
) {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: 'start',
    containScroll: 'trimSnaps',
    dragFree: false,
    skipSnaps: false,
    duration: 0, // Instant scrolling for better TV performance
  });

  // Expose carousel API to parent
  useImperativeHandle(ref, () => ({
    scrollTo: (index) => emblaApi?.scrollTo(index),
    scrollNext: () => emblaApi?.scrollNext(),
    scrollPrev: () => emblaApi?.scrollPrev(),
  }), [emblaApi]);

  // Scroll to active index when it changes
  useEffect(() => {
    if (emblaApi && typeof activeIndex === 'number') {
      emblaApi.scrollTo(activeIndex);
    }
  }, [emblaApi, activeIndex]);

  // Handle keyboard navigation
  useWindowEvent('keydown', (event) => {
    if (!isActive || !emblaApi) return;

    // Prevent handling if already handled
    if (event.defaultPrevented) return;

    const keyCode = event.keyCode.toString();

    switch (keyCode) {
      case KEYCODE_LEFT:
        event.preventDefault();
        event.stopImmediatePropagation();
        if (activeIndex > 0) {
          onNavigate(activeIndex - 1);
        } else {
          // At first item, focus sidebar
          onFocusSidebar();
        }
        break;
      case KEYCODE_RIGHT:
        event.preventDefault();
        event.stopImmediatePropagation();
        if (activeIndex < videos.length - 1) {
          onNavigate(activeIndex + 1);
        }
        break;
      case KEYCODE_ENTER:
        event.preventDefault();
        event.stopImmediatePropagation();
        if (videos[activeIndex]) {
          onSelect(videos[activeIndex]);
        }
        break;
    }
  });

  const handleVideoClick = useCallback((video, index) => {
    onNavigate(index);
    onSelect(video);
  }, [onNavigate, onSelect]);

  if (!videos || videos.length === 0) {
    return null;
  }

  return (
    <div className="embla-wrapper">
      <div className="embla" ref={emblaRef}>
        <div className="embla__container">
          {videos.map((video, index) => (
            <div key={video.id} className="embla__slide">
              <VideoCard
                video={video}
                isActive={showSelection && index === activeIndex}
                onClick={() => handleVideoClick(video, index)}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}));

export default VideoCarousel;
