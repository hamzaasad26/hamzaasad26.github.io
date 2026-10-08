---
title: 'Building ArthoCare: An Arthritis Monitoring App for My FYP'
description: How my team and I built an app that measures joint range of motion with computer vision, and what went wrong along the way
pubDate: 2026-05-08
heroImage: ''
---

## What did we make?

[ArthoCare](https://github.com/hamzaasad26/ArthoCare) is a mobile app for people with arthritis. Its main feature, **RAlens**, uses computer vision to measure the range of motion (ROM) of your joints from a phone or webcam. On top of that, an ensemble of machine learning models makes predictions about the patient's condition, including flare-ups based on diet and habits.

It was my final year project at FAST-NUCES Islamabad, built with two teammates. I worked on the database, the backend, the frontend, and the computer vision models.

## Why build this?

Arthritis is a condition you live with every day, but the tools to track it are limited. Checking how your joints are doing usually means a clinic visit, and in between there's very little structured data for you or your doctor to look at. We wanted to see how much of that tracking a phone could do on its own.

## How RAlens works

RAlens uses MediaPipe Pose, which gives you body landmarks for every video frame. For the elbow, I take three of them (shoulder, elbow, wrist) and compute the angle between the two arm segments:

```python
def elbow_angle(shoulder, elbow, wrist) -> float:
    v1 = shoulder - elbow
    v2 = wrist - elbow
    n1, n2 = np.linalg.norm(v1), np.linalg.norm(v2)
    if n1 < 1e-6 or n2 < 1e-6:
        return 0.0
    cos_a = np.clip(np.dot(v1 / n1, v2 / n2), -1.0, 1.0)
    interior = np.degrees(np.arccos(cos_a))
    return max(0.0, 180.0 - interior)  # 0 = straight, ~145 = fully bent
```

The test is guided. For each arm (left, then right), the user holds a neutral position, then fully straightens the elbow (extension), then fully bends it (flexion). While they move, the app draws the arm skeleton on the video, shows the live angle on a gauge, and tells them what to fix, like "Straighten arm" with how many degrees off they are. At the end, the measurements are compared against AAOS reference values (roughly 145° of flexion and 15° or less of extension), and a report is saved as JSON and text. The same structure is reused for each joint, with its own thresholds.

The risk score in the ROM report is a simple heuristic based on how far the angles are from normal. It's not a diagnosis.

## The ML side: predicting RA risk

The prediction models are trained on health survey data. Here are the results for the RA risk model, built on a preprocessed NHANES dataset.

**The data.** 13,273 samples and 27 features (demographics, diet, activity, smoking, comorbidities like diabetes and hypertension, plus a few engineered ones like age × smoking). Only **6.3%** of the samples have RA (830 vs 12,443), which is the main difficulty.

The EDA showed what you'd expect: women had higher prevalence than men (~7.4% vs ~5.2%), prevalence rose after 50, and former smokers and lower-education groups had higher rates. Age and BRI had the strongest numeric correlation with RA.

**Handling the imbalance.** With 94% of people being non-RA, a model that always says "no RA" is 94% accurate and useless. So I compared class weighting, SMOTE and SMOTE-ENN with Logistic Regression and XGBoost, using 5-fold cross-validation:

| Model | AUROC | AUPRC | Precision | Recall | F1 |
|---|---|---|---|---|---|
| LR (balanced) | 0.801 | 0.207 | 0.229 | 0.458 | 0.295 |
| LR + SMOTE | 0.797 | 0.205 | 0.223 | 0.439 | 0.286 |
| XGB (balanced) | 0.774 | 0.175 | 0.197 | 0.439 | 0.267 |
| XGB + SMOTE | 0.773 | 0.174 | 0.189 | 0.493 | 0.269 |
| LR + SMOTE-ENN | 0.806 | 0.207 | 0.142 | 0.804 | 0.241 |

Plain Logistic Regression held its own against XGBoost. SMOTE-ENN gave by far the best recall, at the cost of precision.

**Final model: Logistic Regression + SMOTE-ENN**, with a decision threshold of 0.608 (averaged across the CV folds):

| Metric | Value |
|---|---|
| Accuracy | 0.684 |
| AUROC | 0.780 |
| AUPRC | 0.174 |
| Precision | 0.139 |
| Recall | 0.783 |
| F1 | 0.237 |

Picked it for sensitivity on purpose. For a screening tool, missing someone is worse than flagging someone who turns out to be fine, and on the test set it missed only 36 RA cases. The trade-off is real though: with a precision of 0.139, most people it flags won't have RA. Think of it as "worth a closer look", not a verdict.

**What the model leans on.** By permutation importance, the top features were fiber intake, protein intake, former-smoker status, age × current-smoker (50-70), moderate physical activity, calorie intake, diabetes, and race (Non-Hispanic Black). Smoking, age and diabetes match known RA risk factors. The diet features are interesting, but importance isn't causation, so all I'd claim is that they carried signal in this dataset.

## Problem #1: getting the right data

Models are only as good as the data behind them, and finding the right data took much longer than I expected. In the end it came from two places: NHANES, the US national health survey (used for the RA risk model above), and a dataset from a medical institute, which is what the flare-up prediction uses (diet and habits).

## Problem #2: the CV model was picky

This was the other big one. Pose estimation was very sensitive to how the arm was held and where the camera was. A bad angle meant the joint wasn't detected, or it was detected in the wrong place, and the ROM number came out wrong.

Two things helped. First, the app doesn't take the first good-looking frame. It keeps a rolling buffer of the last 14 angle readings, waits until they're stable, asks the user to hold the position for 2 seconds, and for extension and flexion also waits until the angle stops changing before capturing. Second, I added placeholder visuals and previews that show users how to do each pose before they start. If the landmarks aren't visible enough, the app tells the user to move closer or fix the lighting instead of measuring anyway.

## What works, and what I didn't finish

RAlens calculates joint ROM, and the prediction pipeline works. What didn't make it in was a more optimised tracking system we had planned. The time we had for the project was short, and I couldn't build it in time.

ArthoCare is a student prototype, not a diagnostic tool. The code is on [GitHub](https://github.com/hamzaasad26/ArthoCare), and if you read this far, a star would be appreciated 😉
