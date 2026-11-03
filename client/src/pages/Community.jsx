import React, { useEffect, useState } from "react";
import Loading from "./Loading";
import { useAppContext } from "../context/AppContext";

const Community = () => {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { axios, token } = useAppContext();

  const fetchImages = async () => {
    try {
      const { data } = await axios.get("/api/user/published-images", {
        headers: { Authorization: token },
      });

      if (data.success) {
        setImages(data.images);
      } else {
        setError(data.message);
      }
    } catch (error) {
      setError(error.response?.data?.message || error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchImages();
  }, []);

  if (loading) return <Loading />;

  return (
    <div className="p-6 pt-12 xl:px-12 2xl:px-20 w-full mx-auto h-full overflow-y-scroll">
      <h2 className="text-xl font-semibold mb-6 text-gray-800 dark:text-purple-100">
        Community Images
      </h2>

      {error ? (
        <p className="text-red-400">Couldn't load community images: {error}</p>
      ) : images.length > 0 ? (
        <div className="flex flex-wrap max-sm:justify-center gap-5">
          {images.map((item, idx) => (
            <a
              key={idx}
              href={item.imageUrl}
              target="_blank"
              className="relative group block rounded-lg overflow-hidden border border-gray-200 dark:border-purple-700 shadow-sm hover:shadow-md transition-shadow duration-300"
            >
              <img
                src={item.imageUrl}
                alt=""
                className="w-full h-40 md:h-50 2xl:h-62 object-cover group-hover:scale-105 transition-transform duration-300 ease-in-out"
              />
              <p className="absolute bottom-0 right-0 text-xs bg-black/50 backdrop-blur text-white px-4 py-1 rounded-tl-xl opacity-0 group-hover:opacity-100 transition duration-300">Created by {item.userName}</p>
            </a>
          ))}
        </div>
      ) : (
        <p>No images available</p>
      )}
    </div>
  );
};

export default Community;
