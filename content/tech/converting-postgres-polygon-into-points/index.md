---
date: "2025-12-17"
tags: ["postgresql", "postgres-geometry"]
---
# Converting postgres polygon into points

When working with Postgres and dealing with geometric data types, you may encounter situations where you need to convert a polygon into its constituent points. I was unable to find a straightforward function to achieve this, so I used some hacky string replace operations to extract the points from a polygon.

```sql
select replace(replace(replace(('0,0,1,1,2,3'::polygon)::text, '((', '{"'), '),(', '","'), '))', '"}')::point[]
-- {"(0,0)","(1,1)","(2,3)"} (type point[])
```

Having an existing polygon, we first cast it to text. This gives us a string representation of the polygon, which looks something like this: `((0,0),(1,1),(2,3))`. The next step targets the start, the end and the middle of the string to convert it into an array containing points.
