// These checks use Node's built-in test runner, not a replacement database.
// Database-dependent 404/error branches use individual method stubs only.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { spawnSync } from "node:child_process";
import app from "../src/app.js";
import User from "../src/models/user.model.js";
import Post from "../src/models/post.model.js";
import { registerUser, loginUser, logoutUser } from "../src/controllers/user.controller.js";
import { getPosts, updatePost, deletePost } from "../src/controllers/post.controller.js";

let server;
let baseURL;

before(async () => {
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  baseURL = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

const request = async (method, path, body) => {
  const response = await fetch(`${baseURL}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json() };
};

const responseRecorder = () => ({
  statusCode: 200,
  body: undefined,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

test("health check and unknown route return JSON", async () => {
  assert.deepEqual(await request("GET", "/"), {
    status: 200, body: { message: "Backend is running successfully" },
  });
  assert.equal((await request("GET", "/missing")).status, 404);
});

test("body middleware rejects missing, malformed, array, and oversized JSON", async () => {
  for (const body of [[], null, "text"]) {
    assert.equal((await request("POST", "/api/v1/users/register", body)).status, 400);
  }
  const missing = await fetch(`${baseURL}/api/v1/users/register`, { method: "POST" });
  assert.equal(missing.status, 400);
  const malformed = await fetch(`${baseURL}/api/v1/posts/create`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: '{"age":',
  });
  assert.equal(malformed.status, 400);
  assert.match((await malformed.json()).message, /Invalid JSON/);
  assert.equal((await request("POST", "/api/v1/posts/create", { name: "x".repeat(110000) })).status, 400);
});

test("registration rejects missing fields, bad types, invalid email, and password limits", async () => {
  const valid = { username: "student", email: "student@example.com", password: "12345678" };
  for (const body of [
    {}, { ...valid, password: undefined }, { ...valid, username: 42 },
    { ...valid, username: " " }, { ...valid, username: "a".repeat(31) },
    { ...valid, email: "wrong" }, { ...valid, email: "a".repeat(250) + "@x.com" },
    { ...valid, password: "12345" }, { ...valid, password: "é".repeat(37) },
  ]) {
    assert.equal((await request("POST", "/api/v1/users/register", body)).status, 400);
  }
});

test("login and logout validate their request bodies before querying Atlas", async () => {
  for (const body of [{}, { email: 1, password: "12345678" }, { email: "bad", password: "12345678" }, { email: "x@y.com", password: "123" }]) {
    assert.equal((await request("POST", "/api/v1/users/login", body)).status, 400);
  }
  for (const body of [{}, { email: false }, { email: "bad" }]) {
    assert.equal((await request("POST", "/api/v1/users/logout", body)).status, 400);
  }
});

test("post creation rejects invalid fields and accepts only numeric ages", async () => {
  const valid = { name: "Lily", description: "A character", age: 20 };
  for (const body of [
    {}, { ...valid, name: " " }, { ...valid, description: 1 }, { ...valid, description: " " },
    { ...valid, age: "20" }, { ...valid, age: null }, { ...valid, age: -1 },
    { ...valid, age: 151 }, { ...valid, owner: "someone" },
  ]) {
    assert.equal((await request("POST", "/api/v1/posts/create", body)).status, 400);
  }
});

test("update rejects empty bodies, unknown fields, operators, and invalid values", async () => {
  const id = "507f1f77bcf86cd799439011";
  for (const body of [{}, { _id: id }, { $set: { age: 21 } }, { age: "21" }, { age: 151 }, { name: " " }, { description: null }]) {
    assert.equal((await request("PATCH", `/api/v1/posts/update/${id}`, body)).status, 400);
  }
  assert.equal((await request("PATCH", "/api/v1/posts/update/invalid", { age: 21 })).status, 400);
  assert.equal((await request("DELETE", "/api/v1/posts/delete/invalid")).status, 400);
});

test("Mongoose validates schemas, normalizes users, and removes selected password hashes from JSON", async () => {
  const user = new User({ username: " Student ", email: " STUDENT@Example.com ", password: "12345678" });
  await user.validate();
  assert.equal(user.username, "student");
  assert.equal(user.email, "student@example.com");
  assert.equal(user.toJSON().password, undefined);
  assert.equal(User.schema.path("password").options.select, false);
  assert.equal(User.schema.path("username").options.unique, true);
  assert.equal(User.schema.path("email").options.unique, true);
  await assert.rejects(new Post({ name: "Lily", description: "Character", age: 151 }).validate());
  await new Post({ name: "Lily", description: "Character", age: 0 }).validate();
});

test("registration handles a duplicate-key race without leaking the error", async (t) => {
  t.mock.method(User, "findOne", async () => null);
  t.mock.method(User, "create", async () => { throw Object.assign(new Error("private detail"), { code: 11000 }); });
  const res = responseRecorder();
  await registerUser({ body: { username: "student", email: "student@example.com", password: "12345678" } }, res);
  assert.equal(res.statusCode, 409);
  assert.doesNotMatch(JSON.stringify(res.body), /private detail|password/);
});

test("the real save hook hashes passwords once and the comparison method works", async (t) => {
  // Stub only MongoDB writes: Mongoose validation and bcrypt hooks run normally.
  t.mock.method(User.collection, "insertOne", async (document) => ({ acknowledged: true, insertedId: document._id }));
  t.mock.method(User.collection, "updateOne", async () => ({ acknowledged: true, matchedCount: 1, modifiedCount: 1 }));
  const user = new User({ username: "hook-check", email: "hook@example.com", password: "12345678" });
  await user.save();
  const firstHash = user.password;
  assert.notEqual(firstHash, "12345678");
  assert.equal(await user.comparePassword("12345678"), true);
  assert.equal(await user.comparePassword("wrong-password"), false);
  user.username = "updated-name";
  await user.save();
  assert.equal(user.password, firstHash);
  assert.equal(user.toJSON().password, undefined);
  user.password = "new-password";
  await user.save();
  assert.notEqual(user.password, firstHash);
  assert.equal(await user.comparePassword("new-password"), true);
  assert.equal(await user.comparePassword("12345678"), false);
});

test("unknown email and wrong password produce the same login response", async (t) => {
  const query = t.mock.method(User, "findOne", () => ({ select: async () => null }));
  const unknown = responseRecorder();
  const req = { body: { email: "student@example.com", password: "wrong-password" } };
  await loginUser(req, unknown);
  query.mock.mockImplementation(() => ({ select: async () => ({ comparePassword: async () => false }) }));
  const wrong = responseRecorder();
  await loginUser(req, wrong);
  assert.equal(unknown.statusCode, 401);
  assert.equal(wrong.statusCode, 401);
  assert.deepEqual(unknown.body, wrong.body);
});

test("missing posts and logout users produce 404", async (t) => {
  t.mock.method(Post, "findByIdAndUpdate", async () => null);
  t.mock.method(Post, "findByIdAndDelete", async () => null);
  t.mock.method(User, "findOne", async () => null);
  const id = "507f1f77bcf86cd799439011";
  for (const handler of [updatePost, deletePost]) {
    const res = responseRecorder();
    await handler({ params: { id }, body: { age: 21 } }, res);
    assert.equal(res.statusCode, 404);
  }
  const res = responseRecorder();
  await logoutUser({ body: { email: "missing@example.com" } }, res);
  assert.equal(res.statusCode, 404);
});

test("unexpected database failures return a safe 500", async (t) => {
  t.mock.method(Post, "find", async () => { throw new Error("private database address"); });
  const res = responseRecorder();
  await getPosts({}, res);
  assert.equal(res.statusCode, 500);
  assert.doesNotMatch(JSON.stringify(res.body), /private database address/);
});

test("registration route saves through real Mongoose/bcrypt middleware and returns safe user fields", async (t) => {
  t.mock.method(User, "findOne", async () => null);
  t.mock.method(User.collection, "insertOne", async (document) => {
    assert.notEqual(document.password, "12345678");
    assert.match(document.password, /^\$2[aby]\$/);
    return { acknowledged: true, insertedId: document._id };
  });
  const result = await request("POST", "/api/v1/users/register", {
    username: " Student ", email: " STUDENT@example.com ", password: "12345678",
  });
  assert.equal(result.status, 201);
  assert.equal(result.body.user.username, "student");
  assert.equal(result.body.user.email, "student@example.com");
  assert.deepEqual(Object.keys(result.body.user).sort(), ["_id", "email", "username"]);
});

test("successful login and simulated logout are wired to their controllers", async (t) => {
  const user = new User({ username: "student", email: "student@example.com", password: "12345678" });
  t.mock.method(User.collection, "insertOne", async (document) => ({ acknowledged: true, insertedId: document._id }));
  await user.save();
  const query = t.mock.method(User, "findOne", () => ({ select: async () => user }));
  const login = await request("POST", "/api/v1/users/login", { email: "STUDENT@example.com", password: "12345678" });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.password, undefined);
  assert.match(login.body.message, /No persistent session/);
  query.mock.mockImplementation(async () => user);
  const logout = await request("POST", "/api/v1/users/logout", { email: "student@example.com" });
  assert.equal(logout.status, 200);
  assert.match(logout.body.message, /Simulated logout/);
});

test("post routes create, list, update, and delete with allowed fields", async (t) => {
  t.mock.method(Post.collection, "insertOne", async (document) => ({ acknowledged: true, insertedId: document._id }));
  const created = await request("POST", "/api/v1/posts/create", { name: " Lily ", description: "A character", age: 0 });
  assert.equal(created.status, 201);
  assert.equal(created.body.post.name, "Lily");
  assert.equal(created.body.post.age, 0);
  const post = created.body.post;
  t.mock.method(Post, "find", async () => [post]);
  const list = await request("GET", "/api/v1/posts/get");
  assert.equal(list.status, 200);
  assert.equal(list.body.posts[0]._id, post._id);
  t.mock.method(Post, "findByIdAndUpdate", async (id, update, options) => {
    assert.equal(id, post._id);
    assert.deepEqual(update, { $set: { age: 21 } });
    assert.equal(options.new, true);
    assert.equal(options.runValidators, true);
    return { ...post, age: 21 };
  });
  const updated = await request("PATCH", `/api/v1/posts/update/${post._id}`, { age: 21 });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.post.age, 21);
  assert.equal(updated.body.post.description, post.description);
  t.mock.method(Post, "findByIdAndDelete", async (id) => {
    assert.equal(id, post._id);
    return post;
  });
  assert.equal((await request("DELETE", `/api/v1/posts/delete/${post._id}`)).status, 200);
});

test("real startup exits before listening when Atlas configuration is missing or a placeholder", () => {
  for (const uri of ["", "mongodb+srv://student:<db_password>@cluster.example.com"]) {
    const result = spawnSync(process.execPath, ["src/index.js"], {
      cwd: new URL("../", import.meta.url),
      env: { ...process.env, MONGODB_URI: uri },
      encoding: "utf8",
      timeout: 10000,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /MongoDB connection failed/);
    assert.doesNotMatch(result.stdout, /Server running/);
    assert.doesNotMatch(result.stderr, /<db_password>/);
  }
});
