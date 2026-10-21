interface Job { run: () => void; priority: number }

export function createLimiter(limit: number) {
  const queue: Job[] = [];
  let active = 0;

  const next = () => {
    while (active < limit && queue.length > 0) {
      const job = queue.shift() as Job;
      active++;
      job.run();
    }
  };

  return function run<T>(task: () => Promise<T>, priority = 0): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const job: Job = {
        priority,
        run: () => {
          task().then(resolve, reject).finally(() => { active--; next(); });
        },
      };
      const index = queue.findIndex((queued) => queued.priority < priority);
      if (index === -1) queue.push(job);
      else queue.splice(index, 0, job);
      next();
    });
  };
}
