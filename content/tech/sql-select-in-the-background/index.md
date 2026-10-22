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
select teacher.name, coalesce(string_agg(lesson.name, ', '), 'no courses planned')
from teacher
left join course on teacher.id = course.teacher_id
where lesson.name like 'Learning%'
group by teacher.name
order by count(lesson.id)
```

Internally, the blocks of the above query become:

**Select list:**

* `teacher.name`
* `coalesce(<result #1>, ', ')`

**Tables:**

* `courses`
* `teacher` (with filter `teacher.id = course.teacher_id`)

**Where:**

* `lesson.name like 'Learning%`

**Grouping by:**

* `teacher.name`

**Grouping expressions:**

* `string_agg(lesson.name, ', ')`
* `count(lesson.id)`

## How the tables get manipulated step by step

Following our initial steps, we start by joining all tables together.

We start with `teachers`

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
  if(!matches) {
    output.push({
      leftRow,
      rightRow: null
    })
  }
}
```

| courses.id | courses.name     | courses.teacher_id | teacher.id | teacher.name |
|------------|------------------|--------------------|------------|--------------|
| 1          | Learning SQL     | 1                  | 1          | Alice        |
| 2          | Learning Coding  | 1                  | 1          | Alice        |
| 3          | History          | 1                  | 1          | Alice        |
| 4          | Learning history | 2                  | 2          | Bob          |
| null       | null             | null               | 3          | Carol        |


