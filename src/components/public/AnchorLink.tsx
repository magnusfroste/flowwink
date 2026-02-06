import { forwardRef, MouseEvent } from 'react';
import { Link, LinkProps } from 'react-router-dom';
import { handleAnchorClick, isAnchorLink } from '@/hooks/useAnchorScroll';

interface AnchorLinkProps extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  href: string;
  children: React.ReactNode;
}

/**
 * A link component that handles both regular links and anchor links (#section).
 * For anchor links, it provides smooth scrolling behavior.
 * For regular links, it behaves like a normal anchor element.
 */
export const AnchorLink = forwardRef<HTMLAnchorElement, AnchorLinkProps>(
  ({ href, onClick, children, ...props }, ref) => {
    const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
      // Call the original onClick if provided
      onClick?.(e);
      
      // Handle anchor links with smooth scrolling
      if (isAnchorLink(href)) {
        handleAnchorClick(e, href);
      }
    };

    return (
      <a ref={ref} href={href} onClick={handleClick} {...props}>
        {children}
      </a>
    );
  }
);

AnchorLink.displayName = 'AnchorLink';

/**
 * A link component that works with both React Router links and anchor links.
 * - For anchor links (#section): Uses smooth scrolling
 * - For internal links (/page): Uses React Router Link
 * - For external links (https://): Uses regular anchor
 */
interface SmartLinkProps {
  href: string;
  children: React.ReactNode;
  className?: string;
  target?: string;
  rel?: string;
  onClick?: () => void;
}

export function SmartLink({ href, children, className, target, rel, onClick }: SmartLinkProps) {
  // Anchor links
  if (isAnchorLink(href)) {
    return (
      <AnchorLink href={href} className={className} onClick={onClick}>
        {children}
      </AnchorLink>
    );
  }

  // External links
  if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:') || href.startsWith('tel:')) {
    return (
      <a href={href} className={className} target={target} rel={rel} onClick={onClick}>
        {children}
      </a>
    );
  }

  // Internal React Router links
  return (
    <Link to={href} className={className} onClick={onClick}>
      {children}
    </Link>
  );
}
