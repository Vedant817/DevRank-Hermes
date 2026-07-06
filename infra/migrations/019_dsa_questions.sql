create table if not exists dsa_questions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  topic text not null,
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  url text not null,
  patterns text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists dsa_questions_topic_difficulty_idx
  on dsa_questions (topic, difficulty);

insert into dsa_questions (slug, title, topic, difficulty, url, patterns) values
  ('two-sum', 'Two Sum', 'Arrays/Hashing', 'easy', 'https://leetcode.com/problems/two-sum/', array['hash map', 'complement lookup']),
  ('group-anagrams', 'Group Anagrams', 'Arrays/Hashing', 'medium', 'https://leetcode.com/problems/group-anagrams/', array['hash map', 'canonical key']),
  ('longest-consecutive-sequence', 'Longest Consecutive Sequence', 'Arrays/Hashing', 'medium', 'https://leetcode.com/problems/longest-consecutive-sequence/', array['hash set', 'sequence boundary']),
  ('first-missing-positive', 'First Missing Positive', 'Arrays/Hashing', 'hard', 'https://leetcode.com/problems/first-missing-positive/', array['index as hash', 'in-place']),
  ('binary-search', 'Binary Search', 'Binary Search/Two Pointers', 'easy', 'https://leetcode.com/problems/binary-search/', array['binary search', 'invariant bounds']),
  ('two-sum-ii', 'Two Sum II - Input Array Is Sorted', 'Binary Search/Two Pointers', 'medium', 'https://leetcode.com/problems/two-sum-ii-input-array-is-sorted/', array['two pointers', 'sorted scan']),
  ('search-in-rotated-sorted-array', 'Search in Rotated Sorted Array', 'Binary Search/Two Pointers', 'medium', 'https://leetcode.com/problems/search-in-rotated-sorted-array/', array['binary search', 'pivot handling']),
  ('median-of-two-sorted-arrays', 'Median of Two Sorted Arrays', 'Binary Search/Two Pointers', 'hard', 'https://leetcode.com/problems/median-of-two-sorted-arrays/', array['binary search', 'partition']),
  ('valid-parentheses', 'Valid Parentheses', 'Stack/Queue/Linked List', 'easy', 'https://leetcode.com/problems/valid-parentheses/', array['stack', 'matching pairs']),
  ('reverse-linked-list', 'Reverse Linked List', 'Stack/Queue/Linked List', 'easy', 'https://leetcode.com/problems/reverse-linked-list/', array['linked list', 'pointer rewiring']),
  ('daily-temperatures', 'Daily Temperatures', 'Stack/Queue/Linked List', 'medium', 'https://leetcode.com/problems/daily-temperatures/', array['monotonic stack']),
  ('lru-cache', 'LRU Cache', 'Stack/Queue/Linked List', 'medium', 'https://leetcode.com/problems/lru-cache/', array['hash map', 'doubly linked list']),
  ('merge-k-sorted-lists', 'Merge k Sorted Lists', 'Stack/Queue/Linked List', 'hard', 'https://leetcode.com/problems/merge-k-sorted-lists/', array['heap', 'linked list merge']),
  ('invert-binary-tree', 'Invert Binary Tree', 'Trees/Graphs', 'easy', 'https://leetcode.com/problems/invert-binary-tree/', array['tree traversal', 'recursion']),
  ('number-of-islands', 'Number of Islands', 'Trees/Graphs', 'medium', 'https://leetcode.com/problems/number-of-islands/', array['bfs', 'dfs', 'grid flood fill']),
  ('course-schedule', 'Course Schedule', 'Trees/Graphs', 'medium', 'https://leetcode.com/problems/course-schedule/', array['topological sort', 'cycle detection']),
  ('word-ladder', 'Word Ladder', 'Trees/Graphs', 'hard', 'https://leetcode.com/problems/word-ladder/', array['bfs', 'shortest path']),
  ('climbing-stairs', 'Climbing Stairs', 'Dynamic Programming', 'easy', 'https://leetcode.com/problems/climbing-stairs/', array['dp', 'fibonacci recurrence']),
  ('coin-change', 'Coin Change', 'Dynamic Programming', 'medium', 'https://leetcode.com/problems/coin-change/', array['dp', 'unbounded knapsack']),
  ('longest-increasing-subsequence', 'Longest Increasing Subsequence', 'Dynamic Programming', 'medium', 'https://leetcode.com/problems/longest-increasing-subsequence/', array['dp', 'patience sorting']),
  ('edit-distance', 'Edit Distance', 'Dynamic Programming', 'hard', 'https://leetcode.com/problems/edit-distance/', array['dp', '2d table'])
on conflict (slug) do nothing;
