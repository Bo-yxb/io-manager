-- CreateTable
CREATE TABLE "blueprints" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "project_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "requirement" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "blueprints_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "blueprint_nodes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "blueprint_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "level" TEXT NOT NULL DEFAULT 'task',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "task_type" TEXT NOT NULL DEFAULT 'Task',
    "assignee" TEXT,
    "timeout_min" INTEGER NOT NULL DEFAULT 60,
    "depends_on" TEXT NOT NULL DEFAULT '[]',
    CONSTRAINT "blueprint_nodes_blueprint_id_fkey" FOREIGN KEY ("blueprint_id") REFERENCES "blueprints" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "blueprints_project_id_idx" ON "blueprints"("project_id");

-- CreateIndex
CREATE INDEX "blueprints_status_idx" ON "blueprints"("status");

-- CreateIndex
CREATE INDEX "blueprint_nodes_blueprint_id_idx" ON "blueprint_nodes"("blueprint_id");
