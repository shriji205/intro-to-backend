import mongoose from "mongoose";
import Post from "../models/post.model.js";

export const createPost = async (req, res) => {
  try {
    const allowedFields = ["name", "description", "age"];
    if (Object.keys(req.body).some((field) => !allowedFields.includes(field))) {
      return res.status(400).json({ message: "Only name, description, and age are allowed." });
    }

    const { name, description, age } = req.body;
    if (name === undefined || description === undefined || age === undefined) {
      return res.status(400).json({ message: "Name, description, and age are required." });
    }

    if (typeof name !== "string" || name.trim().length === 0 || typeof description !== "string" || description.trim().length === 0) {
      return res.status(400).json({ message: "Name and description must be non-empty strings." });
    }

    if (typeof age !== "number" || !Number.isFinite(age) || age < 0 || age > 150) {
      return res.status(400).json({ message: "Age must be a number between 0 and 150." });
    }

    const post = await Post.create({ name: name.trim(), description: description.trim(), age });
    return res.status(201).json({ message: "Post created successfully.", post });
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(400).json({ message: "Invalid post data. Check name, description, and age." });
    }
    return res.status(500).json({ message: "Unable to create post. Please try again later." });
  }
};

export const getPosts = async (req, res) => {
  try {
    const posts = await Post.find();
    return res.status(200).json({ posts });
  } catch {
    return res.status(500).json({ message: "Unable to retrieve posts. Please try again later." });
  }
};

export const updatePost = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isObjectIdOrHexString(id)) {
      return res.status(400).json({ message: "Invalid post ID. Use a 24-character hexadecimal MongoDB ID." });
    }

    const fields = Object.keys(req.body);
    const allowedFields = ["name", "description", "age"];

    if (fields.length === 0) {
      return res.status(400).json({ message: "Provide at least one field to update." });
    }
    if (fields.some((field) => !allowedFields.includes(field))) {
      return res.status(400).json({ message: "Only name, description, and age can be updated." });
    }

    const updates = {};

    if (fields.includes("name")) {
      if (typeof req.body.name !== "string" || req.body.name.trim().length === 0) {
        return res.status(400).json({ message: "Name must be a non-empty string." });
      }
      updates.name = req.body.name.trim();
    }

    if (fields.includes("description")) {
      if (typeof req.body.description !== "string" || req.body.description.trim().length === 0) {
        return res.status(400).json({ message: "Description must be a non-empty string." });
      }
      updates.description = req.body.description.trim();
    }

    if (fields.includes("age")) {
      const { age } = req.body;
      if (typeof age !== "number" || !Number.isFinite(age) || age < 0 || age > 150) {
        return res.status(400).json({ message: "Age must be a number between 0 and 150." });
      }
      updates.age = age;
    }

    const post = await Post.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true },
    );

    if (!post) {
      return res.status(404).json({ message: "Post not found." });
    }
    return res.status(200).json({ message: "Post updated successfully.", post });
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(400).json({ message: "Invalid post data. Check name, description, and age." });
    }
    return res.status(500).json({ message: "Unable to update post. Please try again later." });
  }
};

export const deletePost = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isObjectIdOrHexString(id)) {
      return res.status(400).json({ message: "Invalid post ID. Use a 24-character hexadecimal MongoDB ID." });
    }

    const post = await Post.findByIdAndDelete(id);
    if (!post) {
      return res.status(404).json({ message: "Post not found." });
    }

    return res.status(200).json({ message: "Post deleted successfully." });
  } catch {
    return res.status(500).json({ message: "Unable to delete post. Please try again later." });
  }
};
