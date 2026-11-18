-- Live garden weather: an opted-in owner's ~11 km grid point.
CREATE TABLE "WeatherLocation" (
  "userId" TEXT NOT NULL,
  "lat" DOUBLE PRECISION NOT NULL,
  "lon" DOUBLE PRECISION NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WeatherLocation_pkey" PRIMARY KEY ("userId")
);
ALTER TABLE "WeatherLocation" ADD CONSTRAINT "WeatherLocation_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
