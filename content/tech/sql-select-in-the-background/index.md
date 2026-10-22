---
date: "2025-08-12"
tags: ["tech", "sql"]
---
# How SQL selects execution in the background

SQL queries are typically seen as something magical, but understanding how they get executed behind the scenes helps you in debugging them. SQL engines typically apply a lot of optimizations in the background to speed them up, but understanding the simple model still helps you to know why something happens and even allows you to build your own SQL like engines

The SQL engine follows the following steps:

* Collect rows based on `from` and `join`s
* Filter the rows based on `where` and `on` clauses
* Group data via grouping functions
* Filter the rows based on having clauses
* Order the results
* Skip N rows and then emit N rows
* Run select expressions

Lets take a basic table structure

**Course:**

| id | name             | teacher_id |
|----|------------------|------------|
| 1  | Learning SQL     | 1          |
| 2  | Learning Coding  | 1          |
| 3  | History          | 1          |
| 4  | Learning history | 2          |

**Teacher:**

| id | name  |
|----|-------|
| 1  | Alice |
| 2  | Bob   |
| 3  | Carol |

## Breaking down a simple query

```sql
select teacher.name, coalesce(string_agg(course.name, ', '), 'no courses planned')
from teacher
left join course on teacher.id = course.teacher_id
where course.name like 'Learning%'
group by teacher.name
order by count(course.id)
```

Internally, the blocks of the above query become:

**Select list:**

* `teacher.name`
* `coalesce(<result #1>, 'no courses planned')`

**Tables:**

* `teacher`
* `course` (with filter `teacher.id = course.teacher_id`)

**Where:**

* `course.name like 'Learning%'`

**Grouping by:**

* `teacher.name`

**Grouping expressions:**

* `string_agg(course.name, ', ')`
* `count(course.id)`

## How the tables get manipulated step by step

Following our initial steps, we start by joining all tables together.

We start with `teacher`

| id | name  |
|----|-------|
| 1  | Alice |
| 2  | Bob   |
| 3  | Carol |

We now add the teacher table to this with the above filter. A left join can be seen as the following loop:

```typescript
const output = [];
for(const leftRow of left) {
  let matched = false;
  for (const rightRow of right) {
    if (matches(leftRow, rightRow)) {
      matched = true;
      output.push({
        leftRow,
        rightRow
      })
    }
  }
  if(!matched) {
    output.push({
      leftRow,
      rightRow: null
    })
  }
}
```

| teacher.id | teacher.name | course.id | course.name      | course.teacher_id |
|------------|--------------|-----------|------------------|-------------------|
| 1          | Alice        | 1         | Learning SQL     | 1                 |
| 1          | Alice        | 2         | Learning Coding  | 1                 |
| 1          | Alice        | 3         | History          | 1                 |
| 2          | Bob          | 4         | Learning history | 2                 |
| 3          | Carol        | null      | null             | null              |

Every teacher is kept, and Carol is kept with empty course columns because she has no matching course.

Next comes the `where` clause. Rows where `course.name` does not match `'Learning%'` are removed. `null` does not match a `like`, so Carol's row is dropped too:

| teacher.id | teacher.name | course.id | course.name      | course.teacher_id |
|------------|--------------|-----------|------------------|-------------------|
| 1          | Alice        | 1         | Learning SQL     | 1                 |
| 1          | Alice        | 2         | Learning Coding  | 1                 |
| 2          | Bob          | 4         | Learning history | 2                 |

Now the rows are grouped by `teacher.name`. Each group is collapsed into one row, and the grouping expressions are computed for each group:

| teacher.name | string_agg(course.name, ', ') | count(course.id) |
|--------------|-------------------------------|------------------|
| Alice        | Learning SQL, Learning Coding | 2                |
| Bob          | Learning history              | 1                |

There is no `having` clause, so all groups stay. The `order by` clause sorts the groups by their count, lowest first:

| teacher.name | string_agg(course.name, ', ') | count(course.id) |
|--------------|-------------------------------|------------------|
| Bob          | Learning history              | 1                |
| Alice        | Learning SQL, Learning Coding | 2                |

There is no `limit` or `offset`, so every row is emitted. The last step runs the select expressions on each row. The `coalesce` returns `'no courses planned'` when the aggregate is `null`, which does not happen here:

| teacher.name | coalesce(string_agg, 'no courses planned') |
|--------------|--------------------------------------------|
| Bob          | Learning history                           |
| Alice        | Learning SQL, Learning Coding              |

That is the final result. The engine never ran the `select` list until the very end, which is why an alias defined in `select` cannot be used in `where`, but can be used in `order by`.
