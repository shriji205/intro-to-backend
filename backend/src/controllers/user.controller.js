import User from "../models/user.model.js";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const registerUser = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (username === undefined || email === undefined || password === undefined) {
      return res.status(400).json({ message: "Username, email, and password are required." });
    }

    if (typeof username !== "string" || typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({ message: "Username, email, and password must be strings." });
    }

    const normalizedUsername = username.trim().toLowerCase();
    const normalizedEmail = email.trim().toLowerCase();

    if (normalizedUsername.length < 1 || normalizedUsername.length > 30) {
      return res.status(400).json({ message: "Username must contain 1 to 30 characters." });
    }

    if (normalizedEmail.length > 254 || !emailPattern.test(normalizedEmail)) {
      return res.status(400).json({ message: "Provide a valid email address of at most 254 characters." });
    }

    if (password.length < 6 || Buffer.byteLength(password, "utf8") > 72) {
      return res.status(400).json({ message: "Password must contain at least 6 characters and at most 72 UTF-8 bytes." });
    }

    const existingUser = await User.findOne({
      $or: [{ username: normalizedUsername }, { email: normalizedEmail }],
    });

    if (existingUser) {
      return res.status(409).json({ message: "Username or email is already registered." });
    }

    // The model's pre-save hook hashes the password before MongoDB receives it.
    const user = await User.create({
      username: normalizedUsername,
      email: normalizedEmail,
      password,
    });

    return res.status(201).json({
      message: "User registered successfully.",
      user: { _id: user._id, username: user.username, email: user.email },
    });
  } catch (error) {
    // Two simultaneous registrations can pass findOne; the unique indexes decide.
    if (error.code === 11000) {
      return res.status(409).json({ message: "Username or email is already registered." });
    }
    if (error.name === "ValidationError") {
      return res.status(400).json({ message: "Invalid user data. Check username, email, and password." });
    }
    return res.status(500).json({ message: "Unable to register user. Please try again later." });
  }
};

export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({ message: "Email and password are required and must be strings." });
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!emailPattern.test(normalizedEmail) || normalizedEmail.length > 254) {
      return res.status(400).json({ message: "Provide a valid email address of at most 254 characters." });
    }

    if (password.length < 6 || Buffer.byteLength(password, "utf8") > 72) {
      return res.status(400).json({ message: "Password must contain at least 6 characters and at most 72 UTF-8 bytes." });
    }

    // Only login needs the stored hash; ordinary queries exclude it.
    const user = await User.findOne({ email: normalizedEmail }).select("+password");
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    return res.status(200).json({
      message: "Credentials verified. No persistent session was created.",
      user: { _id: user._id, username: user.username, email: user.email },
    });
  } catch {
    return res.status(500).json({ message: "Unable to log in. Please try again later." });
  }
};

export const logoutUser = async (req, res) => {
  try {
    const { email } = req.body;
    if (typeof email !== "string") {
      return res.status(400).json({ message: "Email is required and must be a string." });
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!emailPattern.test(normalizedEmail) || normalizedEmail.length > 254) {
      return res.status(400).json({ message: "Provide a valid email address of at most 254 characters." });
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    return res.status(200).json({
      message: "Simulated logout successful. No session or token was revoked.",
    });
  } catch {
    return res.status(500).json({ message: "Unable to simulate logout. Please try again later." });
  }
};
