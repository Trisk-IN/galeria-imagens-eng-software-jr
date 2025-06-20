import { createWriteStream, unlinkSync, existsSync } from "fs";
import { pipeline } from "node:stream";
import { promisify } from "node:util";
import { extname, resolve } from "path";
import { randomUUID } from "crypto";
import { prisma } from "../lib/prisma";
import { countPage, pagination } from "../utils/pagination";

const pump = promisify(pipeline);

export const galleryCreate = async (request, reply) => {
  const { title } = request.body;

  try {
    const galleryExist = await prisma.gallery.findFirst({
      where: { title: String(title) },
    });

    if (galleryExist) {
      return reply.status(400).send({
        error: "Bad Request",
        message: "Já existe uma galeria com esse título",
      });
    }

    const gallery = await prisma.gallery.create({
      data: {
        title,
        filename: "",
        url: "",
      },
    });

    return reply.status(201).send({ message: "Galeria criada com sucesso", gallery });
  } catch (error) {
    return reply.status(500).send({
      error: "Internal Server Error",
      message: error.message,
    });
  }
};

export const galleryUpload = async (request, reply) => {
  const { galleryId } = request.params;

  console.log('galleryId', galleryId)

  try {
    const gallery = await prisma.gallery.findFirst({
      where: { id: Number(galleryId) },
    });

    if (!gallery) {
      return reply.status(404).send({
        error: "Not Found",
        message: "Galeria não encontrada",
      });
    }

    const upload = await request.file({
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
      },
    });

    if (!upload) {
      return reply.status(400).send({
        error: "Bad Request",
        message: "Nenhum arquivo enviado",
      });
    }

    if (gallery.filename) {
      const oldFilePath = resolve(__dirname, "../../uploads/", gallery.filename);
      if (existsSync(oldFilePath)) {
        unlinkSync(oldFilePath);
      }
    }

    const fileId = randomUUID();
    const extension = extname(upload.filename);
    const fileName = `${fileId}${extension}`;
    const filePath = resolve(__dirname, "../../uploads/", fileName);

    const writeStream = createWriteStream(filePath);
    await pump(upload.file, writeStream);

    const updatedGallery = await prisma.gallery.update({
      where: { id: gallery.id },
      data: {
        filename: fileName,
        url: `/uploads/${fileName}`,
      },
    });

    return reply.status(200).send({
      message: "Upload realizado com sucesso",
      gallery: updatedGallery,
    });
  } catch (error) {
    return reply.status(500).send({
      error: "Internal Server Error",
      message: error.message,
    });
  }
};

export const galleryUpdate = async (request, reply) => {
    const { galleryId } = request.params;
    const { title } = request.body;

    try {
        const gallery = await prisma.gallery.findUnique({
            where: { id: Number(galleryId) }
        });

        if (!gallery) {
            return reply.status(404).send({
                error: "Not Found",
                message: "Galeria não encontrada",
            });
        }

        const galleryExist = await prisma.gallery.findFirst({
            where: {
                title,
                NOT: { id: Number(galleryId) }
            },
        });

        if (galleryExist) {
            return reply.status(400).send({
                error: "Bad Request",
                message: "Já existe uma galeria com esse título",
            });
        }

        const updated = await prisma.gallery.update({
            where: { id: Number(galleryId) },
            data: { title }
        });

        return reply.status(200).send({ message: "Galeria atualizada com sucesso", gallery: updated });
    } catch (error) {
        return reply.status(500).send({
            error: "Internal Server Error",
            message: error.message,
        });
    } finally {
        await prisma.$disconnect();
    }
};

export const listGallery = async (request, reply) => {
    const { limit, offset, search } = pagination(request);

    try {
        const where: any = search
            ? { titulo: { contains: search, mode: "insensitive" } }
            : {};

        const total = await prisma.gallery.count({ where });
        const total_paginas = countPage(total, limit);

        const rows = await prisma.gallery.findMany({
            where,
            orderBy: { id: "asc" },
            skip: offset,
            take: limit,
            select: {
                id: true,
                title: true,
                url: true,
            },
        });

        reply.send({
            total_paginas,
            rows,
        });
    } catch (error) {
        reply
            .status(500)
            .send({ error: "Internal Server Error", message: error.message });
    } finally {
        await prisma.$disconnect();
    }
};

