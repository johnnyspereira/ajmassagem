'use client';
export const PUBLIC_ENQUIRY_EVENT = 'jp:public-enquiry';
export function PublicEnquiryLink({
  slug,
  subject,
  className,
  children,
}: {
  slug: string;
  subject: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href="#contacto"
      className={className}
      onClick={() =>
        window.dispatchEvent(
          new CustomEvent(PUBLIC_ENQUIRY_EVENT, { detail: { slug, subject } })
        )
      }
    >
      {children}
    </a>
  );
}
