-- Newsletter templates. Greeting uses {Last_Name} when a last name is on file, otherwise {Name}.
-- Edit them any time in Admin → Emails; send them from Admin → Send email (pick the template, choose the audience).
insert into email_templates(event_key, label, subject, body, button_label, button_url, variables, is_system) values
('newsletter_monthly','Newsletter: monthly update','{team} newsletter: what''s new this month',
 E'Dear {Last_Name},\n\nThank you for being part of {team}. Here is what has been happening this month.\n\n**Highlights**\n- Add your first highlight here\n- Add your second highlight here\n- Add your third highlight here\n\n**Coming up**\nAdd upcoming fixtures, training changes or events here.\n\n**A note from the coaches**\nAdd a short message here.\n\nThank you for your support,\nThe {team} team',
 'Open the app','{app_url}','{Last_Name} {Name} {First_Name} {first_name} {name} {email} {team} {app_url}',false),
('newsletter_match_roundup','Newsletter: match & results roundup','{team} roundup: results and fixtures',
 E'Dear {Last_Name},\n\nHere is your {team} roundup.\n\n**Latest results**\nAdd recent scores here, e.g. {team} 3–1 Opponent.\n\n**Next fixtures**\nAdd the next matches with dates and kick-off times here.\n\n**Player of the month**\nAdd a name and a line about why.\n\nSee you on the touchline,\nThe {team} team',
 'See all fixtures','{app_url}','{Last_Name} {Name} {First_Name} {first_name} {name} {email} {team} {app_url}',false),
('newsletter_event','Newsletter: event or announcement','Save the date: event from {team}',
 E'Dear {Last_Name},\n\nWe have an event coming up and we would love to see you there.\n\n**What:** Add the event name\n**When:** Add the date and time\n**Where:** Add the location\n\nAdd a few lines about what to expect, what to bring and who to contact with questions.\n\nWe hope to see you there,\nThe {team} team',
 'Find out more','{app_url}','{Last_Name} {Name} {First_Name} {first_name} {name} {email} {team} {app_url}',false),
('newsletter_season','Newsletter: season update','{team} season update',
 E'Dear {Last_Name},\n\nA quick update on the season so far, and what is next for {team}.\n\n**Where we are**\nAdd league position, wins and key moments here.\n\n**What is next**\nAdd the upcoming schedule, tournaments or tryouts here.\n\n**How you can help**\nAdd volunteering, kit, fees or sponsorship asks here.\n\nThank you for being part of the season,\nThe {team} team',
 'Open the app','{app_url}','{Last_Name} {Name} {First_Name} {first_name} {name} {email} {team} {app_url}',false),
('newsletter_welcome_back','Newsletter: welcome back / new season','Welcome back to {team}',
 E'Dear {Last_Name},\n\nWelcome back, we are glad to have you with {team} for the new season.\n\n**Key dates**\nAdd the first training, first match and any registration deadlines here.\n\n**What to do now**\n- Check your details are up to date in the app\n- Complete any outstanding forms\n- Mark your availability for the first fixtures\n\nAny questions, just reply to this email.\n\nThe {team} team',
 'Open the app','{app_url}','{Last_Name} {Name} {First_Name} {first_name} {name} {email} {team} {app_url}',false)
on conflict (event_key) do nothing;
