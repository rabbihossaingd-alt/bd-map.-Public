# For You

How the Explore feed (ফিড, and রিলস) decides which posts reach more people, and how the admin panel controls it.
Code: `lib/admin-foryou.cjs` (server), `admin/pages/foryou.js` (panel page ফর ইউ নিয়ন্ত্রণ).

## Signals

The app sends what viewers do to `POST /api/explore/events` (stored in `post_events`, kept 90 days):

| kind | when |
|---|---|
| `watch` | a video was on screen and played: `ms` played, `dur`, `done` (seen to the end), `loops` (went round) |
| `skip` | a video left the screen in under 2 seconds of play |
| `share` | the share button |
| `place` | এখানে যান (the way to the post's place) |

Viewers are `u<id>` for an account, or a hash of the address (never the address itself). A person's events on their
own posts are not stored. A video that never loaded is not a skip.

Likes, comments (one per person) and saves come from their own tables.

## The score (every 10 minutes)

For every public post of the last 60 days:

1. Per person who saw it: share of the video watched, seen to the end, skipped; likes, comments, saves, shares,
   এখানে যান taps.
2. Small numbers are pulled toward the average of all posts (as if 20 more average viewers had seen it).
3. Each signal is divided by its average, multiplied by its weight (panel, 0–10), and added (skips subtract).
4. The score is the post's percentile among all recent posts: 0 the lowest, 100 the best.

Photos and text have no watch signals; they are judged on the rest.

## Stages

| stage | reaches up to | opened by |
|---|---|---|
| 0 পরীক্ষা | 200 people | every new post |
| 1 বাড়ছে | 2,000 | score ≥ 45 after 200 |
| 2 বড় | 20,000 | score ≥ 60 after 2,000 |
| 3 সবার জন্য | no limit | score ≥ 75 after 20,000 |

A post that reaches its limit without the next score is **আটকে আছে** (held): it still shows, lower.
The limits and scores are set in the panel.

## The order of the feed

Higher score first, plus: a push for posts still in stage 0, newness (about 3 × the panel's hours), friends a little
up, posts the viewer already watched far down, held posts lower, chance (the visit's seed keeps pages in one order).
No more than 2 posts from one person in a stretch of 10.

## Panel controls (permission `foryou.manage`, every change needs a reason and goes to the audit log)

- **উপরে তুলুন**: a post at the top of everyone's For You, for 1, 3 or 7 days or until changed.
- **ফর ইউ থেকে বাদ দিন**: out of For You; the post stays on the profile.
- **ওজন ও ধাপ বদলান**: the weights, stage limits and scores, newness, the push for new posts, chance.
- **ফর ইউ বন্ধ করুন**: the feed goes back to being mixed by chance.
- **এখনই হিসাব করুন**: score now instead of waiting up to 10 minutes.
