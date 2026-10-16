// Describes how each table is edited in the admin panel. Content lives in the DB; this only describes forms.
export type Field = {
  key: string; label: string;
  type: 'text' | 'longtext' | 'number' | 'bool' | 'select' | 'datetime' | 'date' | 'json';   // date = calendar day, datetime = calendar + time
  options?: { value: string; label: string }[];
  from?: { table: string; label: string };   // select options loaded from a table
  required?: boolean;
};
export type Resource = { filter?: Record<string, string>;  pk?: string; extraLink?: { label: string; route: string }; table: string; title: string; permission: string; titleField: string; order?: string; fields: Field[]; select?: string };

export const RESOURCES: Record<string, Resource> = {
  players: { table: 'players', title: 'Players', permission: 'players.manage', titleField: 'full_name', order: 'shirt_number', fields: [
    { key: 'full_name', label: 'Full name', type: 'text', required: true },
    { key: 'shirt_number', label: 'Shirt number', type: 'number' },
    { key: 'position_id', label: 'Position', type: 'select', from: { table: 'positions', label: 'name' } },
    { key: 'photo_url', label: 'Photo URL', type: 'text' },
    { key: 'height_cm', label: 'Height (cm)', type: 'number' },
    { key: 'preferred_foot', label: 'Preferred foot', type: 'select', options: [{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }, { value: 'both', label: 'Both' }] },
    { key: 'bio', label: 'Bio', type: 'longtext' },
    { key: 'profile_id', label: 'Linked account', type: 'select', from: { table: 'profiles', label: 'full_name' } },
    { key: 'is_active', label: 'Active', type: 'bool' },
  ] },
  positions: { table: 'positions', title: 'Positions', permission: 'players.manage', titleField: 'name', order: 'sort_order', fields: [
    { key: 'name', label: 'Name', type: 'text', required: true }, { key: 'sort_order', label: 'Sort order', type: 'number' } ] },
  staff: { table: 'staff', title: 'Coaches & managers', permission: 'staff.manage', titleField: 'full_name', order: 'sort_order', fields: [
    { key: 'full_name', label: 'Full name', type: 'text', required: true },
    { key: 'title', label: 'Title (e.g. Head Coach)', type: 'text', required: true },
    { key: 'photo_url', label: 'Photo URL', type: 'text' }, { key: 'bio', label: 'Bio', type: 'longtext' },
    { key: 'profile_id', label: 'Linked account', type: 'select', from: { table: 'profiles', label: 'full_name' } },
    { key: 'sort_order', label: 'Sort order', type: 'number' } ] },
  opponents: { table: 'opponents', title: 'Opponents', permission: 'matches.manage', titleField: 'name', fields: [
    { key: 'name', label: 'Name', type: 'text', required: true }, { key: 'logo_url', label: 'Logo URL', type: 'text' } ] },
  matches: { extraLink: { label: 'Events & lineup', route: '/admin/match/' }, table: 'matches', title: 'Matches', permission: 'matches.manage', titleField: 'kickoff_at', order: 'kickoff_at', select: '*', fields: [
    { key: 'opponent_id', label: 'Opponent', type: 'select', from: { table: 'opponents', label: 'name' }, required: true },
    { key: 'kickoff_at', label: 'Kickoff', type: 'datetime', required: true },
    { key: 'venue', label: 'Venue', type: 'text' }, { key: 'competition', label: 'Competition', type: 'text' },
    { key: 'is_home', label: 'Home match', type: 'bool' },
    { key: 'status', label: 'Status', type: 'select', options: ['scheduled', 'live', 'finished', 'postponed', 'cancelled'].map((v) => ({ value: v, label: v })) },
    { key: 'goals_for', label: 'Goals for', type: 'number' }, { key: 'goals_against', label: 'Goals against', type: 'number' },
    { key: 'report', label: 'Match report', type: 'longtext' } ] },
  news: { table: 'news_posts', title: 'News', permission: 'news.manage', titleField: 'title', order: 'created_at', fields: [
    { key: 'title', label: 'Title', type: 'text', required: true }, { key: 'slug', label: 'Slug (url-friendly)', type: 'text', required: true },
    { key: 'summary', label: 'Summary', type: 'longtext' }, { key: 'body', label: 'Body', type: 'longtext', required: true },
    { key: 'cover_url', label: 'Cover image URL', type: 'text' }, { key: 'category', label: 'Category', type: 'text' },
    { key: 'is_featured', label: 'Featured', type: 'bool' },
    { key: 'published_at', label: 'Publish at (blank = draft)', type: 'datetime' } ] },
  announcements: { table: 'announcements', title: 'Announcements', permission: 'news.manage', titleField: 'title', order: 'created_at', fields: [
    { key: 'title', label: 'Title', type: 'text', required: true }, { key: 'body', label: 'Body', type: 'longtext' }, { key: 'is_active', label: 'Active', type: 'bool' } ] },
  nav: { table: 'nav_items', title: 'Navigation', permission: 'settings.manage', titleField: 'label', order: 'sort_order', fields: [
    { key: 'label', label: 'Label', type: 'text', required: true }, { key: 'route', label: 'Route (read-only meaning: /, /matches, /table, /news, /players)', type: 'text', required: true },
    { key: 'sort_order', label: 'Order', type: 'number' }, { key: 'is_visible', label: 'Visible', type: 'bool' },
    { key: 'required_permission', label: 'Required permission', type: 'select', from: { table: 'permissions', label: 'key' } } ] },
  settings: { table: 'site_settings', title: 'Site settings', permission: 'settings.manage', titleField: 'key', fields: [
    { key: 'key', label: 'Key (team_name, primary_color, logo_url, points_win…)', type: 'text', required: true },
    { key: 'value', label: 'Value (JSON, e.g. "Super Strikers" or 3)', type: 'json', required: true } ] },
  eventTypes: { table: 'event_types', title: 'Event types', permission: 'matches.manage', titleField: 'label', order: 'sort_order', fields: [
    { key: 'label', label: 'Label (e.g. Goal, Yellow card)', type: 'text', required: true },
    { key: 'stat_key', label: 'Counts in stats as', type: 'select', options: [{ value: 'goal', label: 'Our goal' }, { value: 'goal_against', label: 'Goal against' }, { value: 'yellow_card', label: 'Yellow card' }, { value: 'red_card', label: 'Red card' }] },
    { key: 'sort_order', label: 'Order', type: 'number' } ] },
  albums: { table: 'albums', title: 'Albums', permission: 'media.manage', titleField: 'title', order: 'created_at', fields: [
    { key: 'title', label: 'Title', type: 'text', required: true }, { key: 'description', label: 'Description', type: 'longtext' },
    { key: 'cover_url', label: 'Cover image URL', type: 'text' }, { key: 'is_published', label: 'Published', type: 'bool' } ] },
  registrationFields: { table: 'registration_fields', title: 'Registration form', permission: 'registrations.manage', titleField: 'label', order: 'sort_order', fields: [
    { key: 'key', label: 'Key (no spaces, e.g. phone)', type: 'text', required: true },
    { key: 'label', label: 'Question', type: 'text', required: true },
    { key: 'type', label: 'Type', type: 'select', options: ['text', 'longtext', 'number', 'date', 'select'].map((v) => ({ value: v, label: v })), required: true },
    { key: 'options', label: 'Options for select type (JSON list, e.g. ["A","B"])', type: 'json' },
    { key: 'required', label: 'Required', type: 'bool' }, { key: 'sort_order', label: 'Order', type: 'number' }, { key: 'is_active', label: 'Active', type: 'bool' } ] },
  notificationRules: { table: 'notification_rules', title: 'Notification rules', permission: 'notifications.manage', titleField: 'label', fields: [
    { key: 'label', label: 'Name', type: 'text', required: true },
    { key: 'event_key', label: 'Event (news_published, match_result or match_reminder — don\'t change)', type: 'text', required: true },
    { key: 'enabled', label: 'Enabled', type: 'bool' },
    { key: 'title_template', label: 'Title ({title} {summary} {team} · {opponent} {goals_for} {goals_against} {time} {venue} {home_away})', type: 'text', required: true },
    { key: 'body_template', label: 'Message', type: 'longtext' } ] },
  competitions: { extraLink: { label: 'Open table / sync', route: '/admin/competition/' }, table: 'competitions', title: 'League tables', permission: 'competitions.manage', titleField: 'name', order: 'sort_order', fields: [
    { key: 'name', label: 'Competition name', type: 'text', required: true },
    { key: 'season', label: 'Season (e.g. 2026 or 2026/27)', type: 'text' },
    { key: 'source', label: 'Source', type: 'select', options: [{ value: 'manual', label: 'Manual (paste table)' }, { value: 'api', label: 'League API' }], required: true },
    { key: 'provider_id', label: 'API provider (for API source)', type: 'select', from: { table: 'api_providers', label: 'name' } },
    { key: 'config', label: 'API settings JSON, e.g. {"league":"PL","own_team_name":"Super Strikers"}', type: 'json' },
    { key: 'auto_sync', label: 'Include in scheduled sync', type: 'bool' }, { key: 'is_visible', label: 'Visible on site', type: 'bool' },
    { key: 'is_primary', label: 'Primary (shown first / on Home)', type: 'bool' }, { key: 'sort_order', label: 'Order', type: 'number' } ] },
  apiProviders: { table: 'api_providers', title: 'League API providers', permission: 'competitions.manage', titleField: 'name', fields: [
    { key: 'name', label: 'Provider name', type: 'text', required: true },
    { key: 'url_template', label: 'URL ({league} {season} filled in; {{LEAGUE_API_KEYNAME}} for a secret)', type: 'text', required: true },
    { key: 'headers', label: 'Headers JSON, e.g. {"X-Auth-Token":"{{LEAGUE_API_MYKEY}}"}', type: 'json' },
    { key: 'rows_path', label: 'Path to standings list in the response (e.g. standings.0.table)', type: 'text', required: true },
    { key: 'field_map', label: 'Field map JSON (our column → path in each row)', type: 'json', required: true },
    { key: 'notes', label: 'Notes', type: 'longtext' } ] },
  playerPrivate: { table: 'player_private', title: 'Player private details (DOB, phone)', permission: 'players.manage', titleField: 'players.full_name', select: '*, players(full_name)', fields: [
    { key: 'player_id', label: 'Player', type: 'select', from: { table: 'players', label: 'full_name' }, required: true },
    { key: 'date_of_birth', label: 'Date of birth', type: 'date' },
    { key: 'phone', label: 'Phone', type: 'text' }, { key: 'emergency_contact', label: 'Emergency contact', type: 'text' } ] },
  events: { table: 'events', title: 'Calendar events', permission: 'events.manage', titleField: 'title', order: 'starts_at', fields: [
    { key: 'title', label: 'Title (e.g. Training)', type: 'text', required: true },
    { key: 'starts_at', label: 'Starts', type: 'datetime', required: true },
    { key: 'ends_at', label: 'Ends (optional)', type: 'datetime' },
    { key: 'location', label: 'Location', type: 'text' }, { key: 'category', label: 'Category (Training, Social…)', type: 'text' },
    { key: 'description', label: 'Details', type: 'longtext' },
    { key: 'repeat', label: 'Repeats', type: 'select', options: [{ value: 'none', label: 'Once' }, { value: 'weekly', label: 'Weekly' }] },
    { key: 'repeat_until', label: 'Repeat until (optional)', type: 'date' },
    { key: 'is_published', label: 'Published', type: 'bool' } ] },
  awardTypes: { table: 'award_types', title: 'Award types', permission: 'awards.manage', titleField: 'label', order: 'sort_order', fields: [
    { key: 'label', label: 'Award name', type: 'text', required: true }, { key: 'sort_order', label: 'Order', type: 'number' } ] },
  awards: { table: 'awards', title: 'Awards', permission: 'awards.manage', titleField: 'period_label', order: 'awarded_on', select: '*', fields: [
    { key: 'award_type_id', label: 'Award', type: 'select', from: { table: 'award_types', label: 'label' }, required: true },
    { key: 'player_id', label: 'Winner', type: 'select', from: { table: 'players', label: 'full_name' } },
    { key: 'period_label', label: 'Period (e.g. October 2026)', type: 'text', required: true },
    { key: 'awarded_on', label: 'Date', type: 'date' }, { key: 'note', label: 'Why they won', type: 'longtext' },
    { key: 'is_published', label: 'Published', type: 'bool' } ] },
  pages: { table: 'pages', title: 'Info & legal pages', permission: 'pages.manage', titleField: 'title', order: 'sort_order', fields: [
    { key: 'slug', label: 'Slug (privacy, terms…)', type: 'text', required: true }, { key: 'title', label: 'Title', type: 'text', required: true },
    { key: 'body', label: 'Text', type: 'longtext', required: true }, { key: 'sort_order', label: 'Order', type: 'number' }, { key: 'is_published', label: 'Published', type: 'bool' } ] },
  tryouts: { extraLink: { label: 'Applications', route: '/admin/tryouts/' }, table: 'tryouts', title: 'Tryouts', permission: 'tryouts.manage', titleField: 'title', order: 'starts_at', fields: [
    { key: 'title', label: 'Title', type: 'text', required: true },
    { key: 'starts_at', label: 'Starts', type: 'datetime', required: true },
    { key: 'ends_at', label: 'Ends (optional)', type: 'datetime' }, { key: 'location', label: 'Location', type: 'text' },
    { key: 'age_group', label: 'Age group (e.g. 16+, Open)', type: 'text' }, { key: 'capacity', label: 'Places (optional)', type: 'number' },
    { key: 'description', label: 'Details / what to bring', type: 'longtext' },
    { key: 'apply_by', label: 'Apply by (optional)', type: 'datetime' },
    { key: 'applications_open', label: 'Applications open', type: 'bool' }, { key: 'is_published', label: 'Published', type: 'bool' } ] },
  tryoutFields: { table: 'tryout_fields', title: 'Tryout application form', permission: 'tryouts.manage', titleField: 'label', order: 'sort_order', fields: [
    { key: 'key', label: 'Key (no spaces, e.g. phone)', type: 'text', required: true }, { key: 'label', label: 'Question', type: 'text', required: true },
    { key: 'type', label: 'Type', type: 'select', options: ['text', 'longtext', 'number', 'date', 'select'].map((v) => ({ value: v, label: v })), required: true },
    { key: 'options', label: 'Options for select type (JSON list)', type: 'json' },
    { key: 'required', label: 'Required', type: 'bool' }, { key: 'sort_order', label: 'Order', type: 'number' }, { key: 'is_active', label: 'Active', type: 'bool' } ] },
  emailTemplates: { extraLink: { label: 'Preview / send test', route: '/admin/email-template/' }, table: 'email_templates', title: 'Email templates', permission: 'emails.manage', titleField: 'label', order: 'label', fields: [
    { key: 'label', label: 'Name (for admins)', type: 'text', required: true },
    { key: 'event_key', label: 'Key (automatic ones are fixed — don\'t rename; new keys are for manual sending)', type: 'text', required: true },
    { key: 'enabled', label: 'Send automatically', type: 'bool' },
    { key: 'subject', label: 'Subject (placeholders like {first_name})', type: 'text', required: true },
    { key: 'body', label: 'Message — blank line = new paragraph; **bold**; [link text](https://…)', type: 'longtext', required: true },
    { key: 'button_label', label: 'Button text (optional)', type: 'text' }, { key: 'button_url', label: 'Button link (e.g. {action_url} or {app_url})', type: 'text' },
    { key: 'variables', label: 'Placeholders available (reminder)', type: 'longtext' } ] },
  formations: { table: 'formations', title: 'Formations (text & visibility)', permission: 'lineups.manage', titleField: 'name', order: 'name', fields: [
    { key: 'name', label: 'Name', type: 'text', required: true },
    { key: 'format', label: 'Format', type: 'select', options: ['11-a-side', '9-a-side', '7-a-side'].map((v) => ({ value: v, label: v })), required: true },
    { key: 'description', label: 'What it is', type: 'longtext' }, { key: 'how_to_use', label: 'How to use it', type: 'longtext' },
    { key: 'strengths', label: 'Strengths', type: 'longtext' }, { key: 'weaknesses', label: 'Weaknesses', type: 'longtext' },
    { key: 'is_active', label: 'Visible', type: 'bool' } ] },
  trainingSessions: { extraLink: { label: 'Attendance', route: '/admin/training/' }, table: 'training_sessions', title: 'Training sessions & notes', permission: 'training.manage', titleField: 'title', order: 'session_date', fields: [
    { key: 'title', label: 'Title', type: 'text', required: true },
    { key: 'session_date', label: 'Date & time', type: 'datetime', required: true },
    { key: 'focus', label: 'Focus (e.g. pressing, set pieces)', type: 'text' },
    { key: 'plan', label: 'Session plan / drills', type: 'longtext' }, { key: 'notes', label: 'Notes after the session', type: 'longtext' },
    { key: 'visibility', label: 'Who can see it', type: 'select', options: [{ value: 'staff', label: 'Staff only' }, { value: 'team', label: 'Whole team' }], required: true } ] },
  productCategories: { table: 'product_categories', title: 'Shop categories', permission: 'shop.manage', titleField: 'name', order: 'sort_order', fields: [
    { key: 'name', label: 'Name', type: 'text', required: true }, { key: 'sort_order', label: 'Order', type: 'number' } ] },
  products: { extraLink: { label: 'Photos, colours & sizes', route: '/admin/product/' }, table: 'products', title: 'Shop products', permission: 'shop.manage', titleField: 'name', order: 'created_at', fields: [
    { key: 'name', label: 'Name', type: 'text', required: true }, { key: 'slug', label: 'Slug (url-friendly, e.g. home-shirt)', type: 'text', required: true },
    { key: 'category_id', label: 'Category', type: 'select', from: { table: 'product_categories', label: 'name' } },
    { key: 'price', label: 'Price (e.g. 25.00)', type: 'number', required: true },
    { key: 'compare_at_price', label: 'Old price to cross out (optional — shows "Save 20%")', type: 'number' },
    { key: 'description', label: 'Description', type: 'longtext' },
    { key: 'stock', label: 'Stock in hand (0 = sold out and can\'t be ordered; blank = not tracked; ignored if you add colours/sizes)', type: 'number' },
    { key: 'featured', label: 'Featured', type: 'bool' }, { key: 'is_active', label: 'Visible in shop', type: 'bool' } ] },
  promotions: { filter: { source: 'admin' }, table: 'promotions', title: 'Promotions & discount codes', permission: 'shop.manage', titleField: 'title', order: 'created_at', fields: [
    { key: 'title', label: 'Name (shown in the banner and on receipts)', type: 'text', required: true },
    { key: 'message', label: 'Banner message (e.g. "Free delivery this weekend")', type: 'text' },
    { key: 'kind', label: 'Offer type', type: 'select', options: [{ value: 'percent', label: 'Percent off' }, { value: 'fixed', label: 'Money off' }, { value: 'free_delivery', label: 'Free delivery' }], required: true },
    { key: 'value', label: 'Amount (percent, or money; ignored for free delivery)', type: 'number' },
    { key: 'max_discount', label: 'Biggest discount allowed (optional)', type: 'number' },
    { key: 'min_subtotal', label: 'Minimum spend to qualify (0 = none)', type: 'number' },
    { key: 'code', label: 'Discount code (leave EMPTY to apply automatically to every qualifying order)', type: 'text' },
    { key: 'starts_at', label: 'Starts (empty = now)', type: 'datetime' },
    { key: 'ends_at', label: 'Ends (empty = no end; a countdown shows in the last 3 days)', type: 'datetime' },
    { key: 'max_uses', label: 'Total uses allowed (empty = unlimited)', type: 'number' },
    { key: 'show_banner', label: 'Show in the banner at the top of the site', type: 'bool' },
    { key: 'is_active', label: 'Active', type: 'bool' } ] },
  paymentProviders: { pk: 'key', table: 'payment_providers', title: 'Payment methods (names, on/off, wording)', permission: 'payments.manage', titleField: 'label', order: 'sort_order', fields: [
    { key: 'label', label: 'Name shown to customers', type: 'text', required: true }, { key: 'enabled', label: 'Enabled', type: 'bool' },
    { key: 'instructions', label: 'Message shown at checkout', type: 'longtext' },
    { key: 'mode', label: 'Mode (for your reference: test or live keys)', type: 'select', options: [{ value: 'test', label: 'Test' }, { value: 'live', label: 'Live' }] },
    { key: 'sort_order', label: 'Order', type: 'number' } ] },
  seasons: { table: 'seasons', title: 'Seasons', permission: 'settings.manage', titleField: 'name', order: 'starts_on', fields: [
    { key: 'name', label: 'Name (e.g. Season 2026/27)', type: 'text', required: true },
    { key: 'starts_on', label: 'Starts', type: 'date', required: true }, { key: 'ends_on', label: 'Ends', type: 'date', required: true },
    { key: 'is_current', label: 'Current season', type: 'bool' } ] },
  sponsors: { table: 'sponsors', title: 'Sponsors & partners', permission: 'settings.manage', titleField: 'name', order: 'sort_order', fields: [
    { key: 'name', label: 'Name', type: 'text', required: true }, { key: 'logo_url', label: 'Logo image URL (https)', type: 'text' },
    { key: 'link_url', label: 'Website link (https)', type: 'text' },
    { key: 'tier', label: 'Level (headline shows first)', type: 'select', options: [{ value: 'headline', label: 'Headline' }, { value: 'gold', label: 'Gold' }, { value: 'silver', label: 'Silver' }, { value: 'bronze', label: 'Bronze' }, { value: 'partner', label: 'Partner' }] },
    { key: 'starts_on', label: 'Starts on (optional)', type: 'date' }, { key: 'ends_on', label: 'Ends on (optional; hides automatically)', type: 'date' },
    { key: 'show_footer', label: 'Show in website footer', type: 'bool' }, { key: 'show_home', label: 'Show on home page', type: 'bool' }, { key: 'show_match', label: 'Show on match pages', type: 'bool' },
    { key: 'sort_order', label: 'Order', type: 'number' }, { key: 'is_active', label: 'Shown', type: 'bool' } ] },
  ads: { table: 'ads', title: 'Ads', permission: 'settings.manage', titleField: 'title', order: 'created_at', extraLink: { label: 'Ad report (views & clicks)', route: '/admin/ad-report' }, fields: [
    { key: 'title', label: 'Internal name (only you see this)', type: 'text', required: true },
    { key: 'advertiser', label: 'Advertiser / business name', type: 'text' },
    { key: 'headline', label: 'Headline (max 120 characters)', type: 'text' }, { key: 'body', label: 'Short text (max 300 characters)', type: 'longtext' },
    { key: 'image_url', label: 'Picture URL (https, wide 16:7 looks best)', type: 'text' },
    { key: 'link_url', label: 'Where it leads (https link)', type: 'text' }, { key: 'cta_label', label: 'Button text (e.g. Book now)', type: 'text' },
    { key: 'show_home', label: 'Show on home page', type: 'bool' }, { key: 'show_news', label: 'Show in news stories', type: 'bool' },
    { key: 'show_match', label: 'Show on match pages', type: 'bool' }, { key: 'show_shop', label: 'Show in the shop', type: 'bool' }, { key: 'show_footer', label: 'Show in the website footer', type: 'bool' },
    { key: 'weight', label: 'How often (1 = rarely … 10 = most often)', type: 'number' },
    { key: 'starts_at', label: 'Starts (optional)', type: 'datetime' }, { key: 'ends_at', label: 'Ends (optional; hides automatically)', type: 'datetime' },
    { key: 'max_impressions', label: 'Stop after this many views (optional)', type: 'number' },
    { key: 'is_active', label: 'Switched on', type: 'bool' } ] },
  seoPages: { table: 'seo_pages', title: 'Page search settings', permission: 'settings.manage', titleField: 'path', order: 'path', fields: [
    { key: 'path', label: 'Page address (e.g. /shop, /news, /tryouts)', type: 'text', required: true },
    { key: 'title', label: 'Title in Google (blank = automatic)', type: 'text' }, { key: 'description', label: 'Description in Google (about 150 characters)', type: 'longtext' },
    { key: 'image_url', label: 'Share picture URL (https, optional)', type: 'text' }, { key: 'noindex', label: 'Hide this page from Google', type: 'bool' } ] },
};
