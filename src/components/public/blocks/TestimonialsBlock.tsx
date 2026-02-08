import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Star, ChevronLeft, ChevronRight, Quote } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TestimonialsBlockData, Testimonial } from '@/types/cms';

interface TestimonialsBlockProps {
  data: TestimonialsBlockData;
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={cn(
            'h-4 w-4',
            star <= rating
              ? 'text-warning fill-warning'
              : 'text-muted-foreground/30'
          )}
        />
      ))}
    </div>
  );
}

function TestimonialCard({ 
  testimonial, 
  showRating, 
  showAvatar, 
  variant 
}: { 
  testimonial: Testimonial; 
  showRating: boolean; 
  showAvatar: boolean; 
  variant: string;
}) {
  const initials = testimonial.author
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <Card className={cn(
      'p-6 h-full flex flex-col',
      variant === 'cards' && 'shadow-lg',
      variant === 'minimal' && 'border-0 shadow-none bg-transparent'
    )}>
      {/* Quote Icon */}
      <Quote className="h-8 w-8 text-accent-foreground/20 mb-4" />
      
      {/* Rating */}
      {showRating && testimonial.rating && (
        <div className="mb-3">
          <StarRating rating={testimonial.rating} />
        </div>
      )}

      {/* Content */}
      <blockquote className="flex-1 text-foreground/90 leading-relaxed mb-6">
        "{testimonial.content}"
      </blockquote>

      {/* Author */}
      <div className="flex items-center gap-3 mt-auto">
        {showAvatar && (
          <Avatar className="h-10 w-10">
            <AvatarImage src={testimonial.avatar} alt={testimonial.author} />
            <AvatarFallback className="bg-accent/50 text-accent-foreground text-sm">
              {initials}
            </AvatarFallback>
          </Avatar>
        )}
        <div>
          <div className="font-medium text-sm">{testimonial.author}</div>
          {(testimonial.role || testimonial.company) && (
            <div className="text-xs text-muted-foreground">
              {testimonial.role}
              {testimonial.role && testimonial.company && ' at '}
              {testimonial.company}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

export function TestimonialsBlock({ data }: TestimonialsBlockProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const testimonials = data.testimonials || [];
  const showRating = data.showRating !== false;
  const showAvatar = data.showAvatar !== false;
  const variant = data.variant || 'cards';

  const nextSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % testimonials.length);
  }, [testimonials.length]);

  const prevSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + testimonials.length) % testimonials.length);
  }, [testimonials.length]);

  // Autoplay for carousel
  useEffect(() => {
    if (data.layout !== 'carousel' || data.autoplay === false || testimonials.length <= 1) {
      return;
    }

    const interval = setInterval(() => {
      nextSlide();
    }, (data.autoplaySpeed || 5) * 1000);

    return () => clearInterval(interval);
  }, [data.layout, data.autoplay, data.autoplaySpeed, testimonials.length, nextSlide]);

  if (testimonials.length === 0) {
    return null;
  }

  const gridCols = {
    2: 'md:grid-cols-2',
    3: 'lg:grid-cols-3',
  };

  return (
    <section className="py-12 md:py-16">
      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        {(data.title || data.subtitle) && (
          <div className="text-center mb-10">
            {data.title && (
              <h2 className="font-serif text-3xl md:text-4xl font-semibold mb-3">
                {data.title}
              </h2>
            )}
            {data.subtitle && (
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                {data.subtitle}
              </p>
            )}
          </div>
        )}

        {/* Grid Layout */}
        {data.layout === 'grid' && (
          <div className={cn(
            'grid gap-6',
            gridCols[data.columns || 3]
          )}>
            {testimonials.map((testimonial) => (
              <TestimonialCard
                key={testimonial.id}
                testimonial={testimonial}
                showRating={showRating}
                showAvatar={showAvatar}
                variant={variant}
              />
            ))}
          </div>
        )}

        {/* Single Large Layout */}
        {data.layout === 'single' && testimonials.length > 0 && (
          <div className="max-w-3xl mx-auto">
            <Card className={cn(
              'p-8 md:p-12 text-center',
              variant === 'cards' && 'shadow-xl',
              variant === 'minimal' && 'border-0 shadow-none bg-transparent'
            )}>
              <Quote className="h-12 w-12 text-accent-foreground/20 mx-auto mb-6" />
              
              {showRating && testimonials[currentIndex].rating && (
                <div className="flex justify-center mb-4">
                  <StarRating rating={testimonials[currentIndex].rating!} />
                </div>
              )}

              <blockquote className="text-xl md:text-2xl text-foreground/90 leading-relaxed mb-8">
                "{testimonials[currentIndex].content}"
              </blockquote>

              <div className="flex items-center justify-center gap-4">
                {showAvatar && (
                  <Avatar className="h-14 w-14">
                    <AvatarImage 
                      src={testimonials[currentIndex].avatar} 
                      alt={testimonials[currentIndex].author} 
                    />
                    <AvatarFallback className="bg-accent/50 text-accent-foreground">
                      {testimonials[currentIndex].author
                        .split(' ')
                        .map(n => n[0])
                        .join('')
                        .toUpperCase()
                        .slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                )}
                <div className="text-left">
                  <div className="font-medium">{testimonials[currentIndex].author}</div>
                  {(testimonials[currentIndex].role || testimonials[currentIndex].company) && (
                    <div className="text-sm text-muted-foreground">
                      {testimonials[currentIndex].role}
                      {testimonials[currentIndex].role && testimonials[currentIndex].company && ' at '}
                      {testimonials[currentIndex].company}
                    </div>
                  )}
                </div>
              </div>

              {/* Navigation for multiple testimonials in single mode */}
              {testimonials.length > 1 && (
                <div className="flex items-center justify-center gap-4 mt-8">
                  <Button variant="outline" size="icon" onClick={prevSlide}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div className="flex gap-2">
                    {testimonials.map((_, index) => (
                      <button
                        key={index}
                        onClick={() => setCurrentIndex(index)}
                        className={cn(
                          'w-2 h-2 rounded-full transition-all',
                          index === currentIndex
                            ? 'bg-primary w-6'
                            : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
                        )}
                      />
                    ))}
                  </div>
                  <Button variant="outline" size="icon" onClick={nextSlide}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </Card>
          </div>
        )}

        {/* Carousel Layout */}
        {data.layout === 'carousel' && (
          <div className="relative">
            <div className="overflow-hidden">
              <div 
                className="flex transition-transform duration-500 ease-out"
                style={{ transform: `translateX(-${currentIndex * 100}%)` }}
              >
                {testimonials.map((testimonial) => (
                  <div key={testimonial.id} className="w-full flex-shrink-0 px-4">
                    <div className="max-w-3xl mx-auto">
                      <Card className={cn(
                        'p-8 text-center',
                        variant === 'cards' && 'shadow-lg',
                        variant === 'minimal' && 'border-0 shadow-none bg-transparent'
                      )}>
                        <Quote className="h-10 w-10 text-accent-foreground/20 mx-auto mb-4" />
                        
                        {showRating && testimonial.rating && (
                          <div className="flex justify-center mb-4">
                            <StarRating rating={testimonial.rating} />
                          </div>
                        )}

                        <blockquote className="text-lg md:text-xl text-foreground/90 leading-relaxed mb-6">
                          "{testimonial.content}"
                        </blockquote>

                        <div className="flex items-center justify-center gap-3">
                          {showAvatar && (
                            <Avatar className="h-12 w-12">
                              <AvatarImage src={testimonial.avatar} alt={testimonial.author} />
                              <AvatarFallback className="bg-accent/50 text-accent-foreground">
                                {testimonial.author
                                  .split(' ')
                                  .map(n => n[0])
                                  .join('')
                                  .toUpperCase()
                                  .slice(0, 2)}
                              </AvatarFallback>
                            </Avatar>
                          )}
                          <div className="text-left">
                            <div className="font-medium">{testimonial.author}</div>
                            {(testimonial.role || testimonial.company) && (
                              <div className="text-sm text-muted-foreground">
                                {testimonial.role}
                                {testimonial.role && testimonial.company && ' at '}
                                {testimonial.company}
                              </div>
                            )}
                          </div>
                        </div>
                      </Card>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Navigation */}
            {testimonials.length > 1 && (
              <>
                <Button
                  variant="outline"
                  size="icon"
                  className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 shadow-lg"
                  onClick={prevSlide}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-2 shadow-lg"
                  onClick={nextSlide}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>

                {/* Dots */}
                <div className="flex justify-center gap-2 mt-6">
                  {testimonials.map((_, index) => (
                    <button
                      key={index}
                      onClick={() => setCurrentIndex(index)}
                      className={cn(
                        'w-2 h-2 rounded-full transition-all',
                        index === currentIndex
                          ? 'bg-primary w-6'
                          : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
                      )}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
