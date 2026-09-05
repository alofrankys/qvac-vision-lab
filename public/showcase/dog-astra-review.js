// Frozen, blinded GPT-6 Astra review. Evidence: reports/visionpsy-dog-demo-astra-20260905.json
// Scores apply ONLY to the exact recorded image/question/answer tuple, never a fresh inference.
export const DOG_ASTRA_REVIEW = Object.freeze({
  method: 'astra-blinded-decile-v1',
  model: 'gpt-6-astra',
  passes: 3,
  date: '2026-09-05',
  rows: Object.freeze([
  {
    "sceneId": "personal-dog-3",
    "providerId": "qvac-visionpsy-standard-q8",
    "prompt": "The two mountain explorers have very different looks. Which dog is on the left, and how do their coats differ? Answer in one cheerful sentence using visible features rather than breed names.",
    "imageSha256": "57c29206af49d2cf143fea4b7185fa3614de260fa5931c42679f908dd26ef413",
    "output": "The dog on the left is the Cavalier King Charles Spaniel, identifiable by its white and brown coat. Its fur is soft and long, while the dog on the right has a short tan coat.",
    "score": 0.9,
    "reason": "Correct comparison; breed/format constraint missed."
  },
  {
    "sceneId": "personal-dog-3",
    "providerId": "qvac-visionpsy-standard-q4",
    "prompt": "The two mountain explorers have very different looks. Which dog is on the left, and how do their coats differ? Answer in one cheerful sentence using visible features rather than breed names.",
    "imageSha256": "57c29206af49d2cf143fea4b7185fa3614de260fa5931c42679f908dd26ef413",
    "output": "The dog on the left is the Cavalier King Charles Spaniel. It has a white and brown coat, long floppy ears, and a fluffy tail.",
    "score": 0.7,
    "reason": "Left dog described; comparison incomplete."
  },
  {
    "sceneId": "personal-dog-3",
    "providerId": "qvac-visionpsy",
    "prompt": "The two mountain explorers have very different looks. Which dog is on the left, and how do their coats differ? Answer in one cheerful sentence using visible features rather than breed names.",
    "imageSha256": "57c29206af49d2cf143fea4b7185fa3614de260fa5931c42679f908dd26ef413",
    "output": "The dog on the left has a white and brown coat, while the dog on the right has a tan and white coat.",
    "score": 1,
    "reason": "Correct visible colour contrast."
  },
  {
    "sceneId": "personal-dog-3",
    "providerId": "qvac-visionpsy-flash-q4",
    "prompt": "The two mountain explorers have very different looks. Which dog is on the left, and how do their coats differ? Answer in one cheerful sentence using visible features rather than breed names.",
    "imageSha256": "57c29206af49d2cf143fea4b7185fa3614de260fa5931c42679f908dd26ef413",
    "output": "The dog on the left has a white and brown coat, while the dog on the right has a brown and white coat.",
    "score": 0.8,
    "reason": "Coat contrast only partly explained."
  },
  {
    "sceneId": "personal-dog-1",
    "providerId": "qvac-visionpsy-standard-q8",
    "prompt": "This little dog seems to have found its perfect nap spot. Is it awake or asleep, and what surface is it resting on? Answer like a warm photo caption in one short sentence.",
    "imageSha256": "9d96977578861fca589f54cfb455530f31dc38049ca945eb4eb07c50ec2c5abb",
    "output": "It is asleep.",
    "score": 0.6,
    "reason": "Sleep identified; tiled floor omitted."
  },
  {
    "sceneId": "personal-dog-1",
    "providerId": "qvac-visionpsy-standard-q4",
    "prompt": "This little dog seems to have found its perfect nap spot. Is it awake or asleep, and what surface is it resting on? Answer like a warm photo caption in one short sentence.",
    "imageSha256": "9d96977578861fca589f54cfb455530f31dc38049ca945eb4eb07c50ec2c5abb",
    "output": "It is asleep. The dog is resting on a tiled floor.",
    "score": 0.9,
    "reason": "Correct facts; two sentences."
  },
  {
    "sceneId": "personal-dog-1",
    "providerId": "qvac-visionpsy",
    "prompt": "This little dog seems to have found its perfect nap spot. Is it awake or asleep, and what surface is it resting on? Answer like a warm photo caption in one short sentence.",
    "imageSha256": "9d96977578861fca589f54cfb455530f31dc38049ca945eb4eb07c50ec2c5abb",
    "output": "The little dog is peacefully asleep on a clean, white tiled floor.",
    "score": 1,
    "reason": "Correct sleep and tiled floor."
  },
  {
    "sceneId": "personal-dog-1",
    "providerId": "qvac-visionpsy-flash-q4",
    "prompt": "This little dog seems to have found its perfect nap spot. Is it awake or asleep, and what surface is it resting on? Answer like a warm photo caption in one short sentence.",
    "imageSha256": "9d96977578861fca589f54cfb455530f31dc38049ca945eb4eb07c50ec2c5abb",
    "output": "The little dog is peacefully asleep on a clean, white tiled floor.",
    "score": 1,
    "reason": "Correct sleep and tiled floor."
  },
  {
    "sceneId": "personal-dog-2",
    "providerId": "qvac-visionpsy-standard-q8",
    "prompt": "This outdoor nap looks wonderfully cozy. What is the dog lying on, and what bright-colored item is it wearing? Answer like a warm photo caption in one short sentence.",
    "imageSha256": "5b63161e89efb2be431369e0c59f974fc43a92d44a8c0173abfcb33ca5007083",
    "output": "The dog is resting on a colorful, patterned blanket adorned with elephants and intricate designs. It's wearing a vibrant orange harness.",
    "score": 0.9,
    "reason": "Correct blanket and harness; two sentences."
  },
  {
    "sceneId": "personal-dog-2",
    "providerId": "qvac-visionpsy-standard-q4",
    "prompt": "This outdoor nap looks wonderfully cozy. What is the dog lying on, and what bright-colored item is it wearing? Answer like a warm photo caption in one short sentence.",
    "imageSha256": "5b63161e89efb2be431369e0c59f974fc43a92d44a8c0173abfcb33ca5007083",
    "output": "The dog is lying on a colorful blanket adorned with elephants and patterns. It's wearing a bright orange harness.",
    "score": 0.9,
    "reason": "Correct blanket and harness; two sentences."
  },
  {
    "sceneId": "personal-dog-2",
    "providerId": "qvac-visionpsy",
    "prompt": "This outdoor nap looks wonderfully cozy. What is the dog lying on, and what bright-colored item is it wearing? Answer like a warm photo caption in one short sentence.",
    "imageSha256": "5b63161e89efb2be431369e0c59f974fc43a92d44a8c0173abfcb33ca5007083",
    "output": "The dog is lying on a colorful, patterned blanket, and it's wearing an orange harness.",
    "score": 1,
    "reason": "Correct blanket and orange harness."
  },
  {
    "sceneId": "personal-dog-2",
    "providerId": "qvac-visionpsy-flash-q4",
    "prompt": "This outdoor nap looks wonderfully cozy. What is the dog lying on, and what bright-colored item is it wearing? Answer like a warm photo caption in one short sentence.",
    "imageSha256": "5b63161e89efb2be431369e0c59f974fc43a92d44a8c0173abfcb33ca5007083",
    "output": "The dog is lying on a colorful, patterned blanket, and it's wearing an orange harness. The scene is bathed in warm sunlight, making the nap look especially cozy.",
    "score": 0.9,
    "reason": "Correct facts; extra sentence."
  },
  {
    "sceneId": "personal-dog-5",
    "providerId": "qvac-visionpsy-standard-q8",
    "prompt": "These cafe companions look ready to leave. How many dogs are visible, and what item with a loop-shaped handle lies on the floor beside them? Answer in one playful sentence.",
    "imageSha256": "dea880b63df6bfc970b62cbb62f1d71487a45d721ca845f9f012416590e085fa",
    "output": "Two dogs are visible, and the item on the floor is a dog leash.",
    "score": 1,
    "reason": "Correct count and leash."
  },
  {
    "sceneId": "personal-dog-5",
    "providerId": "qvac-visionpsy-standard-q4",
    "prompt": "These cafe companions look ready to leave. How many dogs are visible, and what item with a loop-shaped handle lies on the floor beside them? Answer in one playful sentence.",
    "imageSha256": "dea880b63df6bfc970b62cbb62f1d71487a45d721ca845f9f012416590e085fa",
    "output": "There are two dogs visible in the cafe, and the item on the floor is a loop-shaped handle for a pet toy.",
    "score": 0.6,
    "reason": "Correct count; leash called a toy."
  },
  {
    "sceneId": "personal-dog-5",
    "providerId": "qvac-visionpsy",
    "prompt": "These cafe companions look ready to leave. How many dogs are visible, and what item with a loop-shaped handle lies on the floor beside them? Answer in one playful sentence.",
    "imageSha256": "dea880b63df6bfc970b62cbb62f1d71487a45d721ca845f9f012416590e085fa",
    "output": "Two dogs are visible, and the item on the floor is a pet grooming brush.",
    "score": 0.6,
    "reason": "Correct count; leash called a brush."
  },
  {
    "sceneId": "personal-dog-5",
    "providerId": "qvac-visionpsy-flash-q4",
    "prompt": "These cafe companions look ready to leave. How many dogs are visible, and what item with a loop-shaped handle lies on the floor beside them? Answer in one playful sentence.",
    "imageSha256": "dea880b63df6bfc970b62cbb62f1d71487a45d721ca845f9f012416590e085fa",
    "output": "Two dogs are visible, and the item on the floor is a pet grooming brush.",
    "score": 0.6,
    "reason": "Correct count; leash called a brush."
  }
])
})

export function findDogAstraReview(scene, providerId, output) {
  return DOG_ASTRA_REVIEW.rows.find(row => row.sceneId === scene.id && row.providerId === providerId && row.prompt === scene.prompt && row.output === output) || null
}
