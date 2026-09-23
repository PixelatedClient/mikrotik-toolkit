import { getAffiliatesByTag, type AffiliateLink } from '../data/affiliates';

interface Props {
  tags: string[];
}

export default function AffiliateSidebar({ tags }: Props) {
  // Collect unique affiliates from all tags
  const affiliatesSet = new Map<string, AffiliateLink>();

  tags.forEach(tag => {
    const links = getAffiliatesByTag(tag);
    links.forEach(link => {
      if (!affiliatesSet.has(link.name)) {
        affiliatesSet.set(link.name, link);
      }
    });
  });

  const affiliates = Array.from(affiliatesSet.values()).slice(0, 3); // Limit to 3 for sidebar

  if (!affiliates.length) return null;

  const trackAffiliateClick = (partnerId: string) => {
    try {
      const clicks = JSON.parse(localStorage.getItem('na-affiliate-clicks') || '{}');
      clicks[partnerId] = (clicks[partnerId] || 0) + 1;
      localStorage.setItem('na-affiliate-clicks', JSON.stringify(clicks));
    } catch (e) {
      // localStorage access blocked
    }
  };

  return (
    <section className="mt-8 rounded-lg border border-line bg-surface p-4">
      <p className="text-sm font-semibold text-fg">Related tools</p>
      <ul className="mt-3 space-y-2">
        {affiliates.map((link) => (
          <li key={link.name} className="text-xs">
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackAffiliateClick(link.id || link.name.toLowerCase().replace(/\s+/g, '-'))}
              className="text-accent hover:underline"
            >
              {link.name}
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted">
        These are affiliate links. <a href="/sponsors" className="text-accent hover:underline">Learn how we fund Network Academy</a>.
      </p>
    </section>
  );
}
