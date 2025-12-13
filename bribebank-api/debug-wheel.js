import { prisma } from './src/lib/prisma.js';

async function main() {
  const segs = await prisma.wheelSegment.findMany({ 
    orderBy: { createdAt: 'asc' } 
  });
  
  console.log('Wheel Segments:');
  segs.forEach((seg, i) => {
    console.log(`${i}: ${seg.label} - ${seg.color} - prob: ${seg.prob}`);
  });
  
  await prisma.$disconnect();
}

main();
