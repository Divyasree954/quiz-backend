const express = require('express');
const Quiz = require('../models/Quiz');
const { protect, adminOnly } = require('../middleware/auth');

const router = express.Router();

// @route GET /api/quizzes - Get all published quizzes (public)
router.get('/', async (req, res) => {
  try {
    const { category, difficulty, search, page = 1, limit = 10 } = req.query;
    const query = { isPublished: true };

    if (category) query.category = category;
    if (difficulty) query.difficulty = difficulty;
    if (search) query.title = { $regex: search, $options: 'i' };

    const total = await Quiz.countDocuments(query);
    const quizzes = await Quiz.find(query)
      .populate('createdBy', 'username')
      .select('-questions.options.isCorrect')
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .sort({ createdAt: -1 });

    res.json({ quizzes, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route GET /api/quizzes/admin - Get all quizzes for admin
router.get('/admin', protect, adminOnly, async (req, res) => {
  try {
    const quizzes = await Quiz.find()
      .populate('createdBy', 'username email')
      .sort({ createdAt: -1 });
    res.json({ quizzes });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route GET /api/quizzes/my - Get quizzes created by logged-in user
router.get('/my', protect, async (req, res) => {
  try {
    const quizzes = await Quiz.find({ createdBy: req.user._id }).sort({ createdAt: -1 });
    res.json({ quizzes });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route GET /api/quizzes/:id - Get single quiz
router.get('/:id', protect, async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.id).populate('createdBy', 'username');
    if (!quiz) return res.status(404).json({ message: 'Quiz not found' });

    // Hide correct answers unless it's the creator or admin
    if (req.user._id.toString() !== quiz.createdBy._id.toString() && req.user.role !== 'admin') {
      const quizObj = quiz.toObject();
      quizObj.questions = quizObj.questions.map(q => ({
        ...q,
        options: q.options.map(o => ({ text: o.text, _id: o._id }))
      }));
      return res.json({ quiz: quizObj });
    }

    res.json({ quiz });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route POST /api/quizzes - Create quiz
router.post('/', protect, async (req, res) => {
  try {
    const quiz = await Quiz.create({ ...req.body, createdBy: req.user._id });
    res.status(201).json({ message: 'Quiz created successfully', quiz });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// @route PUT /api/quizzes/:id - Update quiz
router.put('/:id', protect, async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.id);
    if (!quiz) return res.status(404).json({ message: 'Quiz not found' });

    if (quiz.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to update this quiz' });
    }

    const updated = await Quiz.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    res.json({ message: 'Quiz updated successfully', quiz: updated });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// @route DELETE /api/quizzes/:id - Delete quiz
router.delete('/:id', protect, async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.id);
    if (!quiz) return res.status(404).json({ message: 'Quiz not found' });

    if (quiz.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to delete this quiz' });
    }

    await Quiz.findByIdAndDelete(req.params.id);
    res.json({ message: 'Quiz deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route PATCH /api/quizzes/:id/publish - Toggle publish status
router.patch('/:id/publish', protect, async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.id);
    if (!quiz) return res.status(404).json({ message: 'Quiz not found' });

    if (quiz.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized' });
    }

    quiz.isPublished = !quiz.isPublished;
    await quiz.save();
    res.json({ message: `Quiz ${quiz.isPublished ? 'published' : 'unpublished'}`, quiz });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
